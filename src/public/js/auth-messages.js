// Translate only the browser display; API codes and response messages stay unchanged.
const errorMessages = new Map([
    ['INVALID_EMAIL', '올바른 이메일 주소를 입력하세요.'],
    ['INVALID_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않아요.'],
    ['EMAIL_ALREADY_REGISTERED', '이미 가입된 이메일이에요. 다른 이메일을 사용해 주세요.'],
    ['USERNAME_ALREADY_REGISTERED', '이미 사용 중인 아이디예요. 다른 아이디를 사용해 주세요.'],
    ['DB_CONFLICT', '이미 사용 중인 정보가 있어요. 입력한 정보를 확인해 주세요.'],
    ['INTERNAL_ERROR', '서버에 문제가 발생했어요. 잠시 후 다시 시도해 주세요.'],
]);

export function getAuthErrorMessage(code, mode) {
    if (code === 'INVALID_PASSWORD') {
        return mode === 'signup'
            ? '비밀번호가 안내된 조건을 충족하지 않아요.'
            : '비밀번호를 입력하세요.';
    }
    return errorMessages.get(code) || '문제가 발생했어요. 다시 시도해 주세요.';
}
