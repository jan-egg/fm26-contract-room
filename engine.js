/* Contract Room negotiation logic. No DOM access, so it runs in the page and under `node --test`. */
(function(root){

  /* ---------- terms and assumptions ---------- */
  const TERMS = [
    {h:'Pay'},
    {k:'wage',    label:'Base wage',              def:12000},
    {k:'rise',    label:'Yearly wage rise (%)',   def:5},
    {k:'signon',  label:'Signing-on fee',         def:0},
    {k:'loyalty', label:'Loyalty bonus',          def:0},
    {k:'agent',   label:'Agent fee',              def:0},
    {h:'Bonuses'},
    {k:'appfee',  label:'Appearance fee',         def:800},
    {k:'goal',    label:'Goal bonus',             def:1200},
    {k:'assist',  label:'Assist bonus',           def:600},
    {k:'csb',     label:'Clean sheet bonus',      def:0},
    {k:'sub',     label:'Unused sub fee',         def:350},
    {h:'Clauses'},
    {k:'wageafter',label:'Wage after X matches',  def:0},
    {k:'release', label:'Minimum fee release',    def:0}
  ];
  const KEYS = TERMS.filter(t=>t.k).map(t=>t.k);
  const LABEL = {}; TERMS.forEach(t=>{ if(t.k) LABEL[t.k]=t.label; });
  const STRIP_ORDER = ['sub','appfee','rise','goal','assist','csb'];
  const CONCESSIONS = ['agent','signon','loyalty'];
  // Fallback lump sum when he has not asked for one, in weeks of base wage.
  const CONCESSION_WEEKS = { agent:8, signon:4, loyalty:4 };

  // [min share of fixtures, max share, share of remaining games spent as an unused sub]
  const ROLE = { starter:[0.55,0.92,0.15], rotation:[0.30,0.62,0.40],
                 backup:[0.10,0.35,0.50],  fringe:[0.02,0.20,0.30] };
  // per-appearance rates, floor to ceiling
  const POS = { gk:{g:[0,0],     a:[0,0.02],   cs:[0.18,0.45]},
                def:{g:[0.02,0.12], a:[0.02,0.12], cs:[0.18,0.45]},
                mid:{g:[0.04,0.30], a:[0.06,0.35], cs:[0,0]},
                att:{g:[0.20,0.85], a:[0.06,0.30], cs:[0,0]} };

  const OPENING = { transfer:0.80, freeagent:0.65, renewal:0.85 };
  const CTXNAME = { transfer:'Transfer target', freeagent:'Free agent', renewal:'Renewal' };
  const PHASES = ['open','ladder','pivot','walk'];

  /* ---------- costs ---------- */
  const yearsOf = inp => Math.max(inp.years || 0, 0.5);
  const toWeekly = (amount, period) => amount * period / 52;

  function events(inp, hi){
    const F=inp.fixtures, r=ROLE[inp.role], p=POS[inp.pos];
    const apps = F*(hi?r[1]:r[0]);
    return { apps, bench:(F-apps)*r[2],
             goals:apps*(hi?p.g[1]:p.g[0]), assists:apps*(hi?p.a[1]:p.a[0]), cs:apps*(hi?p.cs[1]:p.cs[0]) };
  }
  function bonusSeason(inp, p, hi){
    const e=events(inp, hi);
    return e.apps*(p.appfee||0) + e.goals*(p.goal||0) + e.assists*(p.assist||0)
         + e.cs*(p.csb||0) + e.bench*(p.sub||0);
  }
  function packageCost(inp, p){
    const yrs=yearsOf(inp);
    const weekly=toWeekly(p.wage, inp.period), r=(p.rise||0)/100;
    let wageTotal=0, y=yrs;
    for(let k=0;y>0;k++){ const s=Math.min(1,y); wageTotal+=weekly*52*s*Math.pow(1+r,k); y-=s; }
    const gtd = wageTotal + (p.signon||0) + (p.loyalty||0) + (p.agent||0);
    const lo = bonusSeason(inp,p,false)*yrs, hi = bonusSeason(inp,p,true)*yrs;
    return { gtd, varLo:lo, varHi:hi, lo:gtd+lo, hi:gtd+hi, weekly, yrs };
  }

  // Round to a figure you would actually type: three significant digits.
  function niceWage(v){
    if(!(v>0)) return 0;
    const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 2));
    return Math.round(v/step)*step;
  }

  /* ---------- state ---------- */
  const fresh = () => ({ round:1, phase:'open', stalls:0, given:[], lastOffer:null, openWeekly:null, log:[] });

  function openingFactor(closes, ctx){
    const c = closes.filter(x=>x.ctx===ctx);
    if(c.length>=3){
      const avg = c.reduce((s,x)=>s+x.ratio,0)/c.length;
      return { f: Math.max(0.5, Math.round((avg-0.08)*100)/100), measured:true, nn:c.length, avg };
    }
    return { f: OPENING[ctx], measured:false, nn:c.length };
  }

  function normalizeStore(value){
    if(!value || !Array.isArray(value.closes)) return null;
    const closes = value.closes.filter(item =>
      item && Object.prototype.hasOwnProperty.call(OPENING,item.ctx) &&
      Number.isFinite(item.ratio) && item.ratio >= 0 && item.ratio <= 1.2
    ).slice(-1000);
    return { closes };
  }
  const closeKey = c => c.ctx+'|'+c.ratio+'|'+(c.at||'');
  function mergeCloses(mine, theirs){
    const seen = new Set(mine.map(closeKey));
    const added = theirs.filter(c => !seen.has(closeKey(c)) && seen.add(closeKey(c)));
    return { closes: mine.concat(added).sort((a,b)=>(a.at||0)-(b.at||0)).slice(-1000), added: added.length };
  }

  function normalizeSession(value){
    if(!value || typeof value!=='object') return null;
    const s = Object.assign(fresh(), value);
    if(!PHASES.includes(s.phase) || !Number.isInteger(s.round) || s.round<1) return null;
    s.given = Array.isArray(s.given) ? s.given.filter(k=>CONCESSIONS.includes(k)) : [];
    s.log = Array.isArray(s.log) ? s.log.slice(-50) : [];
    if(!Number.isFinite(s.lastOffer)) s.lastOffer = null;
    if(!Number.isFinite(s.openWeekly)) s.openWeekly = null;
    if(!Number.isFinite(s.stalls)) s.stalls = 0;
    return s;
  }

  /* ---------- the recommendation ----------
     inp: { ctx, years, period, walkaway, fixtures, role, pos, demand:{k:v}, locks:{k:bool} }
     fmt: { money(v), wage(v), per } formatters, so the text matches the page's currency. */
  function recommend(inp, S, closes, fmt){
    const ctx=inp.ctx, d=Object.assign({}, inp.demand), locked = k => !!inp.locks[k];
    const steps=[], warns=[];
    const of=openingFactor(closes, ctx);
    const offer = Object.assign({}, d);
    const yrs = yearsOf(inp);
    let phase = S.phase;

    if(S.round===1){
      steps.push('<b>Frame it first.</b> Set the length to '+yrs+' years and give him the highest squad status you will actually honour. Both are reported to pull the wage down before you have argued about it.');
    }
    if(S.round>1 && S.lastOffer!==null && d.wage>0 && d.wage<=S.lastOffer){
      warns.push('He is now asking for '+fmt.wage(d.wage)+' '+fmt.per+', no more than your last offer. Accept his terms as they stand: editing anything can snap the demand back up.');
    }

    // strip
    const toStrip = STRIP_ORDER.filter(k=>d[k]>0 && !locked(k));
    const lockedStrip = STRIP_ORDER.filter(k=>d[k]>0 && locked(k));
    const ceilingOf = keys => { const s={}; keys.forEach(k=>s[k]=d[k]); return bonusSeason(inp,s,true)*yrs; };

    if(toStrip.length){
      steps.push('<b class="strip">Remove and exclude:</b> '+toStrip.map(k=>LABEL[k]).join(', ')+
        '. Worth up to <b>'+fmt.money(ceilingOf(toStrip))+'</b> over the deal if he plays everything. Exclude them from negotiation so they cannot creep back in on the next counter.');
      toStrip.forEach(k=>offer[k]=0);
    }
    if(lockedStrip.length){
      steps.push('<b>He has locked '+lockedStrip.map(k=>LABEL[k]).join(', ')+'</b>, an exposure of up to '+fmt.money(ceilingOf(lockedStrip))+
        '. Ask the agent not to lock clauses down, then remove them. If he will not budge, scale them down in the same proportion as the wage rather than leaving them at the demanded figure.');
    }

    // clauses
    if(d.release>0){
      steps.push('<b>Release clause at '+fmt.money(d.release)+'.</b> '+(locked('release')
        ? 'Locked, so push the value up as far as he will take it. A clause near his current worth kills the resale, which costs you far more than the wage ever will.'
        : 'Remove it. If he insists, raise the figure well above what you expect him to be worth on exit.'));
    }
    if(d.wageafter>0 && locked('wageafter')){
      warns.push('The wage-after-X-matches clause is locked. Do not strip it, and cut it by the same percentage as the base wage, or the deal quietly reprices itself mid-contract.');
    }

    // Concessions: locked ones stay at his figure and stop being currency; given ones stay in.
    const lockedConc = CONCESSIONS.filter(k=>d[k]>0 && locked(k));
    const available = CONCESSIONS.filter(k=>!S.given.includes(k) && !lockedConc.includes(k));
    available.forEach(k=>{ offer[k]=0; });
    const zeroed = available.filter(k=>d[k]>0);
    if(zeroed.length && S.round===1){
      steps.push('<b>Zero the '+zeroed.map(k=>LABEL[k].toLowerCase()).join(' and ')+' for now.</b> These are your currency for later rounds, so do not spend them in the opening offer.');
    }
    if(lockedConc.length && S.round===1){
      steps.push('<b>He has locked the '+lockedConc.map(k=>LABEL[k].toLowerCase()).join(' and ')+'</b>, so '+(lockedConc.length>1?'they stay':'it stays')+' in at his figure and cannot be traded later.');
    }

    // wage
    let wage, why, concession=null;
    if(phase==='open'){
      wage = niceWage(d.wage * of.f);
      why = of.measured
        ? 'Opening at '+Math.round(of.f*100)+'% of his demand. That is your own number: your last '+of.nn+' '+CTXNAME[ctx].toLowerCase()+' deals closed at an average of '+Math.round(of.avg*100)+'% of the first demand.'
        : 'Opening at '+Math.round(of.f*100)+'% of his demand. Community figure for a '+CTXNAME[ctx].toLowerCase()+', not yet tested in your saves.';
    } else if(phase==='ladder'){
      const mid = niceWage((S.lastOffer + d.wage)/2);
      wage = Math.min(d.wage, Math.max(mid, S.lastOffer));
      why = 'Splitting the difference between your last offer and where he has landed.';
    } else if(phase==='pivot'){
      wage = S.lastOffer;
      concession = available[0] || null;
      if(concession){
        const amt = d[concession]>0 ? d[concession] : niceWage(toWeekly(d.wage, inp.period)*CONCESSION_WEEKS[concession]);
        offer[concession] = amt;
        steps.push('<b class="keep">Hold the wage and give him the '+LABEL[concession].toLowerCase()+' instead:</b> '+fmt.money(amt)+
          '. A one-off payment, and it never scales with how well he plays. Raise this rather than the weekly figure.');
        why = 'Wage frozen. The ladder stopped moving, so you are buying the signature with a lump sum instead.';
      } else {
        phase='walk';
      }
    }
    if(phase==='walk'){
      wage = S.lastOffer!==null ? S.lastOffer : niceWage(d.wage*of.f);
      why = 'You are out of cheap concessions.';
      steps.push('<b>End the talks.</b> Walk away and re-approach in about a week. Agents are reported to come back softer, and free agents soften a lot more in late August. If he does not move, he was never worth this price.');
    }
    wage = Math.round(wage);

    // walk-away ceiling is a hard cap
    const ceil = inp.walkaway;
    let capped = false;
    if(ceil>0 && wage>ceil){
      wage = ceil; capped = true;
      warns.push('Capped at your walk-away ceiling of '+fmt.wage(ceil)+' '+fmt.per+'. If he will not take this, walk.');
    }
    offer.wage = wage;

    steps.push('<b>Offer this wage:</b> <span class="bignum">'+fmt.wage(offer.wage)+' '+fmt.per+'</span>against his '+fmt.wage(d.wage)+' '+fmt.per+'.');

    const cD=packageCost(inp,d), cO=packageCost(inp,offer);
    return { steps, warns, offer, demand:d, why, phase, concession, capped, cD, cO,
             savedLo:cD.lo-cO.lo, savedHi:cD.hi-cO.hi };
  }

  /* ---------- what happens after an outcome ----------
     Returns the next state and, for a signing, the calibration record to store. */
  const OUTCOME_TEXT = {accepted:'signed',moved:'countered lower',stalled:'no movement',walked:'walked away'};

  function advance(S, out, r, inp){
    const next = JSON.parse(JSON.stringify(S));
    const demandWeekly = toWeekly(r.demand.wage, inp.period);
    if(next.openWeekly===null) next.openWeekly = demandWeekly;
    next.log.push({round:S.round, offered:r.offer.wage, demand:r.demand.wage, out:OUTCOME_TEXT[out]});

    if(out==='accepted'){
      const offerWeekly = toWeekly(r.offer.wage, inp.period);
      const ratio = next.openWeekly>0 ? offerWeekly/next.openWeekly : 1;
      const close = {ctx:inp.ctx, ratio:Math.min(1.2,ratio), rounds:S.round, at:Date.now()};
      const after = fresh(); after.log = next.log;
      after.log.push({round:'—', offered:r.offer.wage, demand:r.demand.wage, out:'logged for calibration'});
      return { S:after, close };
    }
    next.phase = r.phase;
    next.lastOffer = r.offer.wage;
    if(next.phase==='pivot' && r.concession) next.given.push(r.concession);
    if(out==='moved'){ next.stalls=0; if(next.phase==='open') next.phase='ladder'; }
    if(out==='stalled'){ next.stalls++; if(next.phase==='open'||next.phase==='ladder'){ next.phase = next.stalls>=Math.max(1,inp.stall)?'pivot':'ladder'; } }
    if(out==='walked'){ next.phase='walk'; }
    next.round++;
    return { S:next, close:null };
  }

  /* ---------- screenshot text to values ---------- */
  // Most specific first: a line is assigned to the first term that matches it.
  const CAPTURE_FIELDS = [
    ['wageafter',/\bwage\s*after\b/i],
    ['rise',/\b(?:yearly|annual|wage)\s*(?:wage\s*)?(?:rise|increase)\b/i],
    ['signon',/\bsigning[\s-]*on\b/i],
    ['loyalty',/\bloyalty\b/i],
    ['agent',/\bagent(?:'s)?\s*fee\b/i],
    ['sub',/\bunused\s*(?:sub|substitute)\b/i],
    ['appfee',/\bappearance\b/i],
    ['csb',/\bclean\s*sheets?\b/i],
    ['goal',/\bgoals?\b/i],
    ['assist',/\bassists?\b/i],
    ['release',/\brelease\b/i],
    ['wage',/\b(?:base\s*)?wage\b|\bsalary\b/i]
  ];
  const NUMBER = /([€$£¥])?\s?(\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?:\s?([km])\b)?(\s?%)?/gi;

  function parseAmount(raw, suffix){
    let v = raw.replace(/\s/g,'');
    const lastComma = v.lastIndexOf(','), lastDot = v.lastIndexOf('.');
    if(lastComma>=0 && lastDot>=0){
      const dec = lastComma>lastDot ? ',' : '.';
      v = v.split(dec==='.'?',':'.').join('').replace(dec,'.');
    } else if(lastComma>=0 || lastDot>=0){
      const sep = lastComma>=0 ? ',' : '.';
      const parts = v.split(sep);
      // 12,000 or 1.250.000 is grouping; 1.5 or 12,5 is a decimal. With a k/M suffix, assume decimal.
      const grouped = !suffix && parts.length>1 && parts.slice(1).every(p=>p.length===3);
      v = grouped ? parts.join('') : parts.slice(0,-1).join('')+'.'+parts[parts.length-1];
    }
    const n = parseFloat(v);
    if(!Number.isFinite(n)) return null;
    const s = (suffix||'').toLowerCase();
    return n * (s==='k' ? 1e3 : s==='m' ? 1e6 : 1);
  }

  function captureNumber(line, key){
    const tokens = [];
    for(const m of line.matchAll(NUMBER)){
      const value = parseAmount(m[2], m[3]);
      if(value!==null) tokens.push({ value, money:!!(m[1]||m[3]), pct:!!m[4] });
    }
    if(!tokens.length) return null;
    const pick = key==='rise'
      ? tokens.find(t=>t.pct)
      : tokens.find(t=>t.money);
    // FM lays out "label ... value", so without a clearer signal take the rightmost figure.
    return (pick || tokens[tokens.length-1]).value;
  }

  function findValues(text){
    const values = {};
    text.split(/\r?\n/).forEach(line => {
      const hit = CAPTURE_FIELDS.find(([,pattern]) => pattern.test(line));
      if(!hit || values[hit[0]]!==undefined) return;
      const value = captureNumber(line, hit[0]);
      if(value!==null) values[hit[0]] = value;
    });
    return values;
  }

  const api = { TERMS, KEYS, LABEL, STRIP_ORDER, CONCESSIONS, ROLE, POS, OPENING, CTXNAME,
    events, bonusSeason, packageCost, niceWage, fresh, openingFactor, normalizeStore, mergeCloses,
    normalizeSession, recommend, advance, parseAmount, captureNumber, findValues };
  if(typeof module!=='undefined' && module.exports) module.exports = api;
  else root.ContractEngine = api;
})(this);
