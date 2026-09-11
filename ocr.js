(function(){
  const $ = id => document.getElementById(id);
  let captureBlob = null;
  let captureUrl = null;
  let detected = {};

  const FIELDS = [
    ['wage','Base wage',/\b(?:base\s*)?wage\b(?!\s*(?:rise|increase|after))|\bsalary\b/i],
    ['rise','Yearly wage rise (%)',/(?:yearly|annual|wage)\s*(?:wage\s*)?(?:rise|increase)/i],
    ['signon','Signing-on fee',/signing[\s-]*on/i],
    ['loyalty','Loyalty bonus',/loyalty/i],
    ['agent','Agent fee',/agent(?:'s)?\s*fee/i],
    ['appfee','Appearance fee',/appearance/i],
    ['goal','Goal bonus',/goal/i],
    ['assist','Assist bonus',/assist/i],
    ['csb','Clean sheet bonus',/clean\s*sheet/i],
    ['sub','Unused sub fee',/unused\s*(?:sub|substitute)/i],
    ['wageafter','Wage after X matches',/wage\s*after/i],
    ['release','Minimum fee release',/release/i]
  ];

  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[char]);

  const captureNumber = line => {
    const match = line.match(/(\d[\d\s.,]*)(?:\s*([km]))?\s*%?/i);
    if(!match) return null;
    let value = match[1].replace(/\s/g,'');
    if(value.includes(',') && value.includes('.') && value.lastIndexOf(',') > value.lastIndexOf('.')){
      value = value.replace(/\./g,'').replace(',','.');
    }else value = value.replace(/,/g,'');
    const number = parseFloat(value);
    const suffix = (match[2] || '').toLowerCase();
    if(!Number.isFinite(number)) return null;
    return number * (suffix === 'k' ? 1000 : suffix === 'm' ? 1000000 : 1);
  };

  const findValues = text => {
    const values = {};
    text.split(/\r?\n/).forEach(line => {
      FIELDS.forEach(([key,,pattern]) => {
        if(values[key] === undefined && pattern.test(line)){
          const value = captureNumber(line);
          if(value !== null) values[key] = value;
        }
      });
    });
    return values;
  };

  const showFile = file => {
    if(!file || !file.type.startsWith('image/')) return;
    captureBlob = file;
    if(captureUrl) URL.revokeObjectURL(captureUrl);
    captureUrl = URL.createObjectURL(file);
    $('captureImage').src = captureUrl;
    $('capturePreview').hidden = false;
    $('captureResults').hidden = true;
    $('captureStatus').textContent = 'Image ready.';
  };

  const loadOcr = () => new Promise((resolve,reject) => {
    if(window.Tesseract){ resolve(window.Tesseract); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('OCR unavailable'));
    script.onerror = () => reject(new Error('OCR download failed'));
    document.head.appendChild(script);
  });

  const renderResults = () => {
    const fields = FIELDS.filter(([key]) => detected[key] !== undefined);
    $('captureFields').innerHTML = fields.length ? fields.map(([key,label]) =>
      '<label class="capture-field"><input type="checkbox" data-capture-key="'+key+'" checked> '+escapeHtml(label)+
      ' <input type="number" id="capture_'+key+'" value="'+detected[key]+'" min="0" step="any"></label>'
    ).join('') : '<p class="hint">No labelled amounts were recognised. Try a tighter crop or a clearer screenshot.</p>';
    $('captureResults').hidden = false;
  };

  function init({onApply}){
    $('captureFile').addEventListener('change', event => showFile(event.target.files[0]));
    document.addEventListener('paste', event => {
      const image = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'));
      if(image){ event.preventDefault(); showFile(image.getAsFile()); }
    });
    $('readCapture').addEventListener('click', async () => {
      if(!captureBlob) return;
      $('captureStatus').textContent = 'Loading OCR engine and reading image...';
      $('readCapture').disabled = true;
      try{
        const ocr = await loadOcr();
        const result = await ocr.recognize(captureBlob,'eng');
        detected = findValues(result.data.text);
        renderResults();
        $('captureStatus').textContent = 'Review the detected values below.';
      }catch(error){
        $('captureStatus').textContent = 'Could not read the image. Check your connection and try again.';
      }
      $('readCapture').disabled = false;
    });
    $('applyCapture').addEventListener('click', () => {
      const values = {};
      document.querySelectorAll('[data-capture-key]:checked').forEach(box => {
        const key = box.dataset.captureKey;
        const value = parseFloat($('capture_'+key).value);
        if(Number.isFinite(value)) values[key] = value;
      });
      onApply(values);
      $('captureStatus').textContent = 'Selected values applied.';
    });
    $('clearCapture').addEventListener('click', () => {
      if(captureUrl) URL.revokeObjectURL(captureUrl);
      captureBlob = null;
      captureUrl = null;
      detected = {};
      $('captureFile').value = '';
      $('captureImage').removeAttribute('src');
      $('capturePreview').hidden = true;
      $('captureResults').hidden = true;
    });
  }

  window.ContractCapture = { init };
})();
