(() => {
  'use strict';

  const LOTTIE_PATH = 'img/hero-animations.json';

  // -----------------------
  // Helpers
  // -----------------------
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const safe = (fn) => (...args) => { try { return fn(...args); } catch (err) { console.error(err); } };

  // Toast util (simples)
  const showToast = (el, msg, timeout = 2200) => {
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    setTimeout(() => { el.hidden = true; el.textContent = ''; }, timeout);
  };

  // -----------------------
  // Init on DOM ready
  // -----------------------
  document.addEventListener('DOMContentLoaded', () => {
    // 1) Feather icons (replace)
    if (window.feather) feather.replace();

    // Cache nodes used across modules
    const nodes = {
      ctaWork: $('#cta-work'),
      ctaContact: $('#cta-contact'),
      portfolio: $('#portfolio'),
      contacto: $('#contacto'),
      lottieContainer: $('#lottie-hero'),
      modal: $('#modal'),
      modalTitle: $('#modal-title'),
      modalContent: $('#modal-content'),
      modalClose: $('#modal-close'),
      demoButtons: $$('.demo-btn'),
      contactForm: $('#contact-form'),
      formFeedback: $('#form-feedback'),
      contactToast: $('#contact-toast'),
      copyEmailBtn: $('#copy-email-btn'),
      copyEmailInput: $('#copy-email-input'),
      btnContactForm: $('#btn-contact-form'),
    };

    // Safe scroll helpers
    const smoothScrollTo = (el) => {
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // Attach CTA smooth scrolls (guard null)
    if (nodes.ctaWork) nodes.ctaWork.addEventListener('click', () => smoothScrollTo(nodes.portfolio));
    if (nodes.ctaContact) nodes.ctaContact.addEventListener('click', () => smoothScrollTo(nodes.contacto));

    // -----------------------
    // Intersection Observer: reveal effects (sections, cards)
    // -----------------------
    safe(() => {
      const faders = $$('.section, .card, .profile-card');
      if (!faders.length) return;
      const io = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const el = entry.target;
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
            observer.unobserve(el);
          }
        });
      }, { threshold: 0.12 });
      faders.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(14px)';
        io.observe(el);
      });
    })();

    // -----------------------
    // Lottie: lazy-load and init
    // -----------------------
    (function setupLottieLazy() {
      const container = nodes.lottieContainer;
      if (!container || !window.lottie) return;

      let loaded = false;
      const load = async () => {
        if (loaded) return;
        loaded = true;
        try {
          const resp = await fetch(LOTTIE_PATH);
          if (!resp.ok) throw new Error('Lottie JSON não encontrado');
          const json = await resp.json();
          window.myLottie = lottie.loadAnimation({
            container,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: json
          });

          // pause/play quando a tab perde/ganha visibilidade
          document.addEventListener('visibilitychange', () => {
            if (!window.myLottie) return;
            if (document.hidden) window.myLottie.pause();
            else window.myLottie.play();
          });

        } catch (err) {
          console.warn('Falha ao carregar Lottie:', err);
        }
      };

      const io = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            load();
            observer.unobserve(entry.target);
          }
        });
      }, { root: null, rootMargin: '200px', threshold: 0.05 });

      io.observe(container);
    })();

    // -----------------------
    // Modal (demo iframe)
    // -----------------------
    (function setupModal() {
      const modal = nodes.modal;
      if (!modal) return;
      const modalTitle = nodes.modalTitle;
      const modalContent = nodes.modalContent;
      const openClass = 'open';

      const openModal = (title, url) => {
        if (!modal) return;
        if (modalTitle) modalTitle.textContent = title || 'Projeto';
        if (modalContent) modalContent.innerHTML = `<iframe src="${url}" style="width:100%;height:60vh;border:0;border-radius:8px"></iframe>`;
        modal.classList.add(openClass);
        modal.setAttribute('aria-hidden', 'false');
        // trap focus minimally: focus close button if exists
        if (nodes.modalClose) nodes.modalClose.focus();
      };

      const closeModal = () => {
        if (!modal) return;
        modal.classList.remove(openClass);
        modal.setAttribute('aria-hidden', 'true');
        if (modalContent) modalContent.innerHTML = 'Carregando…';
      };

      // Attach demo buttons using delegation (in case of dynamic cards)
      document.addEventListener('click', (ev) => {
        const btn = ev.target.closest && ev.target.closest('.demo-btn');
        if (btn) {
          const url = btn.dataset.url;
          const card = btn.closest('.card');
          const title = card ? (card.querySelector('h4')?.textContent || '') : '';
          if (url) openModal(title, url);
        }
      });

      // close handlers
      if (nodes.modalClose) nodes.modalClose.addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    })();

    // -----------------------
    // Contact form -> POST /api/contact
    // -----------------------
    (function setupFormHandling() {
      const form = nodes.contactForm;
      const feedback = nodes.formFeedback;
      if (!form) return;

      // validation helpers
      const isRequired = (v) => v && v.trim().length > 0;
      const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

      const setFeedback = (msg, ok = false) => {
        if (!feedback) return;
        feedback.style.color = ok ? '#9be7b5' : '#ffb4b4';
        feedback.textContent = msg;
      };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // honeypot
        if (form.querySelector('[name=company]')?.value) {
          setFeedback('Falha de validação.');
          return;
        }

        const name = (form.name?.value || '').trim();
        const email = (form.email?.value || '').trim();
        const message = (form.message?.value || '').trim();

        if (!isRequired(name) || name.length < 3) { setFeedback('Nome inválido (mín. 3 caracteres).'); return; }
        if (!isEmail(email)) { setFeedback('Email inválido.'); return; }
        if (!isRequired(message) || message.length < 10) { setFeedback('Mensagem muito curta (mín. 10 caracteres).'); return; }

        // submit state
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn?.innerHTML;
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = 'Enviando…'; }
        setFeedback('Enviando...');

        try {
          const res = await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, message })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            setFeedback(data.message || 'Mensagem enviada. Obrigado!', true);
            form.reset();
          } else {
            setFeedback(data.message || 'Erro ao enviar. Tente novamente.');
          }
        } catch (err) {
          console.error('Erro envio form:', err);
          setFeedback('Erro de conexão. Tente mais tarde.');
        } finally {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalText; }
        }
      });
    })();

    // -----------------------
    // Copy Email + Scroll-to-form + Toast
    // -----------------------
    (function setupCopyAndScroll() {
      const copyBtn = nodes.copyEmailBtn;
      const copyInput = nodes.copyEmailInput;
      const toast = nodes.contactToast;
      const formAnchor = nodes.btnContactForm;
      const contactForm = nodes.contactForm;

      // copy helper with fallback
      const copyText = async (text) => {
        if (!text) throw new Error('No text to copy');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(text);
        }
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
        } finally {
          document.body.removeChild(ta);
        }
      };

      if (copyBtn && copyInput) {
        copyBtn.addEventListener('click', async () => {
          try {
            await copyText(copyInput.value);
            // temporário feedback: ícone -> check
            const original = copyBtn.innerHTML;
            copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            showToast(toast, 'Email copiado para a área de transferência ✔', 1800);
            setTimeout(() => { if (window.feather) feather.replace(); copyBtn.innerHTML = original; }, 1800);
          } catch (err) {
            console.error('Copy failed', err);
            showToast(toast, 'Falha ao copiar. Use Ctrl+C.');
          }
        });
      }

      // scroll to form (smooth)
      if (formAnchor && contactForm) {
        formAnchor.addEventListener('click', (e) => {
          e.preventDefault();
          contactForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            const firstField = contactForm.querySelector('input, textarea');
            if (firstField) firstField.focus();
          }, 600);
        });
      }
    })();
    
    (function () {
      const year = new Date().getFullYear();
      const el = document.getElementById('site-year');
      if (el) {
        el.textContent = year;
        el.setAttribute('datetime', String(year));
      }
    })();    

    if (window.feather) feather.replace();
  }); // DOMContentLoaded end

})(); // IIFE end


