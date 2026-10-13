// The validator argument is the same installed library used by authService.
export function validateAuth(values, mode, validator, passwordRules) {
    const errors = {};
    if (mode === 'signup' && !values.username) {
        errors.username = 'Enter a username.';
    }
    if (!validator.isEmail(values.email)) {
        errors.email = 'Enter a valid email address.';
    }
    if (!values.password) {
        errors.password = 'Enter your password.';
    } else if (mode === 'signup' && !validator.isStrongPassword(values.password, passwordRules)) {
        errors.password = 'Your password does not meet the listed requirements.';
    }
    return errors;
}
