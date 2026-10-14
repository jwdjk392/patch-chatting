import { validateAuth } from './auth-validation.js';
import { getAuthErrorMessage } from './auth-messages.js';

const form = document.getElementById('auth-form');
const validator = window.validator;

// Keep native form submission available if the validation library cannot load.
if (form && validator) {
    const mode = form.dataset.mode;
    const passwordRules = JSON.parse(form.dataset.passwordRules);
    const fields = ['username', 'email', 'password'].filter(name => form.elements.namedItem(name));
    const formError = document.getElementById('form-error');
    const submit = form.querySelector('button[type="submit"]');
    const strength = document.getElementById('password-strength');
    const touched = new Set();
    let submitting = false;

    // Use validator's email rules (including Unicode addresses), not a different
    // browser-specific email algorithm. Native validation remains the no-JS fallback.
    form.noValidate = true;

    function values() {
        return Object.fromEntries(new FormData(form));
    }

    function showFieldError(name, message) {
        const input = form.elements.namedItem(name);
        const error = document.getElementById(`${name}-error`);
        input.setAttribute('aria-invalid', message ? 'true' : 'false');
        input.classList.toggle('is-invalid', Boolean(message));
        error.textContent = message || '';
        error.hidden = !message;
    }

    function showFormError(message) {
        formError.textContent = message;
        formError.hidden = false;
        formError.focus();
    }

    function updateStrength() {
        if (!strength) return;
        const password = form.elements.namedItem('password').value;
        const valid = validator.isStrongPassword(password, passwordRules);
        strength.dataset.valid = String(valid);
        strength.className = valid ? 'form-text text-success' : 'form-text';
        strength.textContent = !password ? '' : valid ? '비밀번호가 모든 조건을 충족해요.' : '안내된 문자 종류를 포함해 안전한 비밀번호를 만들어 주세요.';
    }

    for (const name of fields) {
        const input = form.elements.namedItem(name);
        input.addEventListener('blur', () => {
            touched.add(name);
            showFieldError(name, validateAuth(values(), mode, validator, passwordRules)[name]);
        });
        input.addEventListener('input', () => {
            formError.hidden = true;
            if (touched.has(name)) showFieldError(name, validateAuth(values(), mode, validator, passwordRules)[name]);
            if (name === 'password') updateStrength();
        });
    }
    updateStrength();

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (submitting) return;
        formError.hidden = true;
        const data = values();
        const errors = validateAuth(data, mode, validator, passwordRules);
        for (const name of fields) {
            touched.add(name);
            showFieldError(name, errors[name]);
        }
        const firstInvalid = fields.find(name => errors[name]);
        if (firstInvalid) {
            form.elements.namedItem(firstInvalid).focus();
            return;
        }

        submitting = true;
        submit.disabled = true;
        form.setAttribute('aria-busy', 'true');
        try {
            const response = await fetch(form.action, {
                method: 'POST',
                headers: { Accept: 'application/json' },
                body: new URLSearchParams(data),
                credentials: 'same-origin',
            });
            if (response.ok && response.redirected) {
                window.location.assign(response.url);
                return;
            }
            const payload = await response.json().catch(() => null);
            showFormError(getAuthErrorMessage(payload?.error?.code, mode));
        } catch {
            showFormError('연결할 수 없어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
        } finally {
            submitting = false;
            submit.disabled = false;
            form.removeAttribute('aria-busy');
        }
    });
}
