/* ============================================================
   PÁTRIA SEM FRONTEIRAS — interações da landing
   ============================================================ */
(() => {
  "use strict";

  /* ---------- ano no footer ---------- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- reveal on scroll ---------- */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  /* ---------- contador regressivo: 31/12/2026 23:59:59 (Brasília, UTC-3) ---------- */
  const PROMO_END = new Date("2026-12-31T23:59:59-03:00").getTime();
  const cd = {
    months: document.getElementById("cd-months"),
    days: document.getElementById("cd-days"),
    hours: document.getElementById("cd-hours"),
    minutes: document.getElementById("cd-minutes"),
    seconds: document.getElementById("cd-seconds"),
  };

  const pad = (n) => String(n).padStart(2, "0");

  function tickCountdown() {
    const diff = PROMO_END - Date.now();
    if (diff <= 0) {
      // promoção encerrada: zera o contador
      if (cd.months) cd.months.textContent = "00";
      if (cd.days) cd.days.textContent = "00";
      if (cd.hours) cd.hours.textContent = "00";
      if (cd.minutes) cd.minutes.textContent = "00";
      if (cd.seconds) cd.seconds.textContent = "00";
      return;
    }

    const totalSeconds = Math.floor(diff / 1000);
    const months = Math.floor(totalSeconds / (30 * 24 * 3600));
    const days = Math.floor((totalSeconds % (30 * 24 * 3600)) / (24 * 3600));
    const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (cd.months) cd.months.textContent = pad(months);
    if (cd.days) cd.days.textContent = pad(days);
    if (cd.hours) cd.hours.textContent = pad(hours);
    if (cd.minutes) cd.minutes.textContent = pad(minutes);
    if (cd.seconds) cd.seconds.textContent = pad(seconds);
  }

  if (cd.seconds) {
    tickCountdown();
    setInterval(tickCountdown, 1000);
  }

  /* ---------- máscara de celular (00) 00000-0000 ---------- */
  const phoneInput = document.getElementById("celular");
  if (phoneInput) {
    phoneInput.addEventListener("input", () => {
      const digits = phoneInput.value.replace(/\D/g, "").slice(0, 11);
      let out = digits;
      if (digits.length > 2) {
        out = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
      }
      if (digits.length > 7) {
        out = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
      }
      phoneInput.value = out;
    });
  }

  /* ---------- formulário ---------- */
  const form = document.getElementById("lead-form");
  const feedback = document.getElementById("form-feedback");
  const submitBtn = document.getElementById("submit-btn");

  function setFeedback(message, type) {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.remove("form__feedback--ok", "form__feedback--error");
    if (type) feedback.classList.add(`form__feedback--${type}`);
  }

  function markInvalid(el, invalid) {
    el.classList.toggle("invalid", invalid);
  }

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setFeedback("", null);

      const nome = form.nome.value.trim();
      const email = form.email.value.trim();
      const idade = form.idade.value.trim();
      const celular = form.celular.value.trim();
      const website = form.website ? form.website.value : "";

      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
      const idadeNum = Number(idade);
      const idadeOk = Number.isInteger(idadeNum) && idadeNum >= 18 && idadeNum <= 99;
      const celularDigits = celular.replace(/\D/g, "");
      const celularOk = celularDigits.length >= 10 && celularDigits.length <= 11;
      const nomeOk = nome.length >= 3 && nome.length <= 100;

      markInvalid(form.nome, !nomeOk);
      markInvalid(form.email, !emailOk);
      markInvalid(form.idade, !idadeOk);
      markInvalid(form.celular, !celularOk);

      if (!nomeOk || !emailOk || !idadeOk || !celularOk) {
        setFeedback("Confira os campos destacados e tente novamente.", "error");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Enviando...";

      try {
        const response = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, email, idade: idadeNum, celular, website }),
        });

        const data = await response.json().catch(() => ({ ok: false }));

        if (response.ok && data.ok) {
          setFeedback(
            "Recebido! O Guia do Patriota já está a caminho do seu e-mail. Nossa equipe entrará em contato em breve.",
            "ok"
          );
          form.reset();
        } else {
          setFeedback(data.error || "Não foi possível enviar agora. Tente novamente em instantes.", "error");
        }
      } catch {
        setFeedback("Falha de conexão. Verifique sua internet e tente novamente.", "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Garantir meu plano com 22% OFF";
      }
    });
  }
})();
