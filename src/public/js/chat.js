(() => {
    const dialog = document.getElementById('connection-dialog');
    const message = document.getElementById('connection-message');
    const status = document.getElementById('connection-status');
    const labels = {
        connecting: '서버 연결 중…', authenticating: '서버 연결됨 · 인증 중…',
        connected: '서버 연결됨', refreshing: '서버 연결됨 · 인증 갱신 중…',
        retrying: '서버 연결됨 · 인증 갱신 재시도 중…',
        reconnecting: '서버에 다시 연결 중…', disconnected: '서버 연결 끊김',
    };
    function setStatus(state) {
        if (status.dataset.state !== state) console.info('[Chat] Connection status', { state });
        status.dataset.state = state;
        status.textContent = labels[state];
        document.chatClient?.onStatus?.();
        document.chatClient?.onRoomsStatus?.();
    }
    function showProblem(text) {
        message.textContent = text;
        if (!dialog.open) dialog.showModal();
    }
    document.getElementById('connection-retry').addEventListener('click', () => location.reload());
    if (typeof io !== 'function') {
        setStatus('disconnected');
        console.error('[Chat] Socket.IO client failed to load');
        showProblem('채팅 서버에 연결할 수 없습니다. 다시 시도해 주세요.');
        return;
    }

    const socket = io({ autoConnect: false, reconnectionAttempts: 5, timeout: 10_000 });
    let generation = 0;
    let refreshTimer;
    let expiryTimer;
    let request;
    let deadline = 0;
    document.chatClient = { socket, isReady: () => socket.connected && deadline > Date.now() };

    function clearAuthentication() {
        generation++;
        clearTimeout(refreshTimer);
        clearTimeout(expiryTimer);
        request?.abort();
        deadline = 0;
    }
    function stop(text, code = 'CONNECTION_FAILED') {
        clearAuthentication();
        socket.disconnect();
        setStatus('disconnected');
        console.warn('[Chat] Connection stopped', { code });
        showProblem(text);
    }

    async function authenticate(currentGeneration) {
        const refreshing = deadline > Date.now();
        setStatus(refreshing ? 'refreshing' : 'authenticating');
        const controller = new AbortController();
        request = controller;
        const timeout = setTimeout(() => controller.abort(), 8_000);
        const started = Date.now();
        try {
            const response = await fetch('/api/auth/get-token', {
                credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
            });
            if (currentGeneration !== generation) return;
            if (response.status === 401) {
                stop('로그인이 만료되었습니다. 다시 로그인해 주세요.', 'SESSION_EXPIRED');
                return;
            }
            if (!response.ok) {
                console.warn('[Chat] Token request failed', { status: response.status });
                throw new Error('Token request failed');
            }
            const { token } = await response.json();
            if (currentGeneration !== generation || !socket.connected) return;
            const result = await socket.timeout(5_000).emitWithAck('authenticate', token);
            if (currentGeneration !== generation) return;
            if (!result.ok || !Number.isFinite(result.expiresAt) || !Number.isFinite(result.serverTime)) {
                stop('채팅 인증에 실패했습니다. 다시 로그인해 주세요.', 'AUTH_FAILED');
                return;
            }
            // Use server-relative time and subtract round-trip time conservatively.
            const remaining = result.expiresAt - result.serverTime - (Date.now() - started);
            if (remaining <= 0) throw new Error('Token expired');
            deadline = Date.now() + remaining;
            clearTimeout(expiryTimer);
            expiryTimer = setTimeout(() => stop('채팅 인증이 만료되었습니다. 다시 연결해 주세요.', 'TOKEN_EXPIRED'), remaining);
            refreshTimer = setTimeout(() => authenticate(currentGeneration), Math.max(0, remaining - 60_000));
            if (dialog.open) dialog.close();
            setStatus('connected');
            console.info(refreshing ? '[Chat] Authentication refreshed' : '[Chat] Authentication succeeded');
        } catch {
            if (currentGeneration !== generation) return;
            if (deadline > Date.now()) {
                setStatus('retrying');
                console.warn('[Chat] Authentication refresh failed; retrying in 5 seconds');
                showProblem('채팅 인증을 갱신할 수 없습니다. 자동으로 다시 시도합니다.');
                refreshTimer = setTimeout(() => authenticate(currentGeneration), 5_000);
            } else {
                stop('채팅 서버에 연결할 수 없습니다. 다시 시도해 주세요.');
            }
        } finally {
            clearTimeout(timeout);
        }
    }

    socket.on('connect', () => {
        console.info('[Chat] Transport connected', { socketId: socket.id });
        clearAuthentication();
        authenticate(generation);
    });
    socket.on('disconnect', (reason) => {
        clearAuthentication();
        const reconnecting = reason !== 'io server disconnect' && reason !== 'io client disconnect';
        setStatus(reconnecting ? 'reconnecting' : 'disconnected');
        console.warn('[Chat] Transport disconnected', { reason });
        showProblem(reason === 'io server disconnect'
            ? '채팅 연결이 종료되었습니다. 다시 연결하거나 로그인해 주세요.'
            : '채팅 서버와 연결이 끊어졌습니다. 다시 연결하고 있습니다.');
    });
    socket.on('auth:error', () => stop('채팅 인증이 만료되었거나 유효하지 않습니다. 다시 연결하거나 로그인해 주세요.', 'AUTH_REJECTED'));
    socket.on('connect_error', () => {
        setStatus('reconnecting');
        console.warn('[Chat] Connection attempt failed');
        showProblem('채팅 서버에 연결할 수 없습니다. 다시 연결하고 있습니다.');
    });
    socket.io.on('reconnect_attempt', (attempt) => {
        setStatus('reconnecting');
        console.info('[Chat] Reconnecting', { attempt });
    });
    socket.io.on('reconnect_failed', () => stop('채팅 서버에 다시 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.', 'RECONNECT_FAILED'));
    console.info('[Chat] Connecting to server');
    socket.connect();
})();
