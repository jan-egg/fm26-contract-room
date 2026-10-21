(function(){
  const $ = id => document.getElementById(id);
  let captureBlob = null;
  let captureUrl = null;
  let detected = {};

  const { KEYS, LABEL, findValues } = window.ContractEngine;

  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[char]);

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
    script.integrity = 'sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F';
    script.crossOrigin = 'anonymous';
    script.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('OCR unavailable'));
    script.onerror = () => reject(new Error('OCR download failed'));
    document.head.appendChild(script);
  });

  const renderResults = () => {
    const fields = KEYS.filter(key => detected[key] !== undefined);
    $('captureFields').innerHTML = fields.length ? fields.map(key =>
      '<label class="capture-field"><input type="checkbox" data-capture-key="'+key+'" checked> '+escapeHtml(LABEL[key])+
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
