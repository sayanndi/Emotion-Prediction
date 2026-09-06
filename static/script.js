(() => {
  const textInput = document.getElementById('textInput');
  const charCount = document.getElementById('charCount');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const errorMsg = document.getElementById('errorMsg');
  const resultSection = document.getElementById('resultSection');
  const resultPercent = document.getElementById('resultPercent');
  const resultEmotion = document.getElementById('resultEmotion');
  const resultEmoji = document.getElementById('resultEmoji');
  const resultCaption = document.getElementById('resultCaption');
  const bars = document.getElementById('bars');
  const resetBtn = document.getElementById('resetBtn');
  const tracePath = document.getElementById('tracePath');
  const wash = document.getElementById('wash');
  const topbarStatus = document.getElementById('topbarStatus');

  const EMOTION_META = {
    sadness: { emoji: '😥', var: '--sadness' },
    joy: { emoji: '😃', var: '--joy' },
    love: { emoji: '❤️', var: '--love' },
    anger: { emoji: '😠', var: '--anger' },
    fear: { emoji: '😨', var: '--fear' },
    surprise: { emoji: '😯', var: '--surprise' },
  };

  const ORDER = ['sadness', 'joy', 'love', 'anger', 'fear', 'surprise'];

  const CAPTIONS = {
    sadness: 'a heaviness came through in the wording',
    joy: 'the wording reads as genuinely upbeat',
    love: 'warmth and attachment came through strongest',
    anger: 'the language carries some real friction',
    fear: 'a note of worry ran under the sentence',
    surprise: 'something in there reads as unexpected',
  };

  // -------------------------------------------------------
  // Live waveform trace — reacts to what's typed
  // -------------------------------------------------------
  function updateTrace(text) {
    const points = 24;
    let d = 'M0,3';
    if (!text) {
      tracePath.setAttribute('d', 'M0,3 L100,3');
      return;
    }
    for (let i = 0; i <= points; i++) {
      const idx = Math.floor((i / points) * text.length);
      const code = text.charCodeAt(idx) || 32;
      const amp = ((code % 40) / 40) * 2.4;
      const y = 3 + Math.sin(i * 0.9 + code) * amp * 0.5;
      const x = (i / points) * 100;
      d += ` L${x.toFixed(2)},${y.toFixed(2)}`;
    }
    tracePath.setAttribute('d', d);
  }

  textInput.addEventListener('input', () => {
    const val = textInput.value;
    charCount.textContent = `${val.length} / 2000`;
    updateTrace(val);
    if (!errorMsg.hidden) hideError();
  });

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------
  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.hidden = false;
  }

  function hideError() {
    errorMsg.hidden = true;
  }

  function setLoading(isLoading) {
    analyzeBtn.classList.toggle('loading', isLoading);
    analyzeBtn.disabled = isLoading;
  }

  function animateCount(el, target, duration = 900) {
    const start = performance.now();
    function frame(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(target * eased);
      el.textContent = `${value}%`;
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function renderBars(allProbabilities, topEmotion) {
    bars.innerHTML = '';
    const sorted = [...ORDER].sort(
      (a, b) => (allProbabilities[b] ?? 0) - (allProbabilities[a] ?? 0)
    );

    sorted.forEach((emotion, i) => {
      const value = allProbabilities[emotion] ?? 0;
      const pct = Math.round(value * 100);
      const meta = EMOTION_META[emotion];

      const row = document.createElement('div');
      row.className = 'bar-row' + (emotion === topEmotion ? ' top' : '');

      row.innerHTML = `
        <span class="bar-label">
          <span class="dot" style="background:var(${meta.var})"></span>
          ${emotion}
        </span>
        <span class="bar-track">
          <span class="bar-fill" style="background:var(${meta.var})"></span>
        </span>
        <span class="bar-value">${pct}%</span>
      `;
      bars.appendChild(row);

      const fill = row.querySelector('.bar-fill');
      setTimeout(() => {
        fill.style.width = `${pct}%`;
      }, 80 + i * 70);
    });
  }

  function revealResult(data) {
    const { predicted_emotion, confidence, all_probabilities } = data;
    const meta = EMOTION_META[predicted_emotion] || EMOTION_META.joy;

    document.documentElement.style.setProperty('--accent', `var(${meta.var})`);
    wash.classList.add('active');

    resultEmoji.textContent = meta.emoji;
    resultEmotion.textContent = predicted_emotion;
    resultCaption.textContent = CAPTIONS[predicted_emotion] || 'here is what the model picked up on';
    topbarStatus.textContent = `reading: ${predicted_emotion}`;

    resultPercent.textContent = '0%';
    resultSection.hidden = false;
    requestAnimationFrame(() => resultSection.classList.add('show'));

    animateCount(resultPercent, Math.round(confidence * 100));
    renderBars(all_probabilities, predicted_emotion);

    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // -------------------------------------------------------
  // Submit
  // -------------------------------------------------------
  async function analyze() {
    const text = textInput.value.trim();
    hideError();

    if (!text) {
      showError('Type something first — there\u2019s no signal in an empty box.');
      textInput.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (res.status === 503) {
        showError('The model isn\u2019t loaded yet on the server. Give it a moment and try again.');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const detail = Array.isArray(body.detail)
          ? body.detail.map((d) => d.msg).join(', ')
          : body.detail;
        showError(detail || 'Something went wrong reading that. Try again.');
        return;
      }

      const data = await res.json();
      revealResult(data);
    } catch (err) {
      showError('Couldn\u2019t reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  analyzeBtn.addEventListener('click', analyze);

  textInput.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      analyze();
    }
  });

  resetBtn.addEventListener('click', () => {
    resultSection.classList.remove('show');
    setTimeout(() => {
      resultSection.hidden = true;
      wash.classList.remove('active');
      topbarStatus.textContent = 'reading text as feeling';
    }, 300);
    textInput.value = '';
    charCount.textContent = '0 / 2000';
    updateTrace('');
    textInput.focus();
  });

  updateTrace('');
})();
