// The validator argument is the same installed library used by authService.
export function validateAuth(values, mode, validator, passwordRules) {
    const errors = {};
    if (mode === 'signup' && !values.username) {
        errors.username = '사용자 아이디를 입력하세요.';
    }
    if (!validator.isEmail(values.email)) {
        errors.email = '올바른 이메일 주소를 입력하세요.';
    }
    if (!values.password) {
        errors.password = '비밀번호를 입력하세요.';
    } else if (mode === 'signup' && !validator.isStrongPassword(values.password, passwordRules)) {
        errors.password = '비밀번호가 안내된 조건을 충족하지 않아요.';
    }
    return errors;
}
