(() => {
    const client = document.chatClient;
    if (!client) return;
    const list = document.getElementById('messages');
    const currentUserId = list.dataset.currentUserId;
    const input = document.getElementById('message');
    const send = document.getElementById('send-message');
    const form = document.getElementById('message-form');
    const status = document.getElementById('message-status');
    const readStatus = document.getElementById('read-status');
    const retry = document.getElementById('retry-messages');
    const readThrough = new Map();
    const pendingReads = new Set();
    const drafts = new Map();
    let room;
    let sending = false;
    let historyLoaded = false;
    let version = 0;
    let selectionVersion = 0;
    let messages = new Map();

    function atBottom() {
        return list.scrollHeight - list.scrollTop - list.clientHeight < 32;
    }
    function updateControls() {
        input.disabled = !room || !client.isReady() || sending;
        send.disabled = input.disabled || !input.value.trim();
    }
    async function markRead() {
        if (!room || !historyLoaded || document.hidden || !atBottom() || !client.isReady()) return;
        const roomId = room.id;
        const messageId = Math.max(0, ...messages.keys());
        if (messageId <= (readThrough.get(roomId) || 0) || pendingReads.has(roomId)) return;
        pendingReads.add(roomId);
        let succeeded = false;
        try {
            const result = await client.socket.timeout(10_000).emitWithAck('message:read', { roomId, messageId });
            if (!result.ok) throw new Error(result.error.message);
            console.info('[Chat] Read progress saved', { roomId, lastReadMessageId: result.lastReadMessageId });
            readThrough.set(roomId, Math.max(readThrough.get(roomId) || 0, result.lastReadMessageId));
            if (room.id === roomId) readStatus.textContent = '';
            succeeded = true;
        } catch (error) {
            console.warn('[Chat] Read progress save failed', { roomId, messageId, error: error.message });
            if (room.id === roomId) readStatus.textContent = '읽음 상태를 저장하지 못했습니다. 다시 불러오기를 눌러 주세요.';
        } finally {
            pendingReads.delete(roomId);
            // Include messages received while the previous read acknowledgement was pending.
            if (succeeded && room.id === roomId) markRead();
        }
    }
    function render(stickToBottom = false) {
        list.replaceChildren(...Array.from(messages.values()).sort((a, b) => a.id - b.id).map((message) => {
            const outgoing = message.senderId === currentUserId;
            const item = document.createElement('li');
            item.className = `d-flex align-items-start gap-2 mb-4 ${outgoing ? 'justify-content-end' : 'justify-content-start'}`;
            const sender = room.members.find((member) => member.userId === message.senderId)?.user;
            const name = sender?.name?.trim() || sender?.username || '알 수 없는 사용자';
            if (!outgoing) {
                const avatar = document.createElement('span');
                avatar.className = 'badge rounded-pill text-bg-warning p-2 flex-shrink-0';
                avatar.setAttribute('aria-hidden', 'true');
                avatar.textContent = Array.from(name)[0];
                item.append(avatar);
            }
            const content = document.createElement('div');
            content.className = `d-flex flex-column w-75 ${outgoing ? 'align-items-end' : 'align-items-start'}`;
            const label = document.createElement('span');
            label.className = 'small text-body-secondary text-break mw-100';
            label.textContent = outgoing ? '나' : name;
            const body = document.createElement('p');
            body.className = `rounded-3 p-3 mt-1 mb-1 mw-100 text-start text-break ${outgoing ? 'text-bg-primary' : 'bg-body-tertiary'}`;
            // Preserve line breaks while treating all message content as plain text.
            message.text.split('\n').forEach((line, index) => {
                if (index) body.append(document.createElement('br'));
                body.append(document.createTextNode(line));
            });
            const time = document.createElement('time');
            time.className = 'small text-body-secondary';
            time.dateTime = message.sentAt;
            time.title = new Date(message.sentAt).toLocaleString();
            time.textContent = new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            content.append(label, body, time);
            item.append(content);
            return item;
        }));
        if (stickToBottom) list.scrollTop = list.scrollHeight;
        markRead();
    }
    async function loadHistory() {
        if (!room) return;
        const current = ++version;
        const roomId = room.id;
        console.info('[Chat] Loading message history', { roomId });
        const stickToBottom = !historyLoaded || atBottom();
        historyLoaded = false;
        status.textContent = '메시지를 불러오는 중…';
        retry.hidden = false;
        try {
            const response = await fetch(`/api/chat-rooms/${encodeURIComponent(roomId)}/messages`, { credentials: 'same-origin', cache: 'no-store' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || '메시지를 불러오지 못했습니다.');
            if (current !== version) return;
            for (const message of data.messages) messages.set(message.id, message);
            historyLoaded = true;
            console.info('[Chat] Message history loaded', { roomId, count: data.messages.length });
            render(stickToBottom);
            status.textContent = '';
        } catch (error) {
            if (current !== version) return;
            console.warn('[Chat] Message history load failed', { roomId, error: error.message });
            status.textContent = error.message;
        }
    }
    let wasReady = client.isReady();
    client.onStatus = () => {
        const ready = client.isReady();
        if (ready && !wasReady) loadHistory();
        wasReady = ready;
        updateControls();
    };
    document.addEventListener('chat:select', (event) => {
        if (room) drafts.set(room.id, input.value);
        room = event.detail;
        console.info('[Chat] Room selected', { roomId: room.id });
        selectionVersion++;
        historyLoaded = false;
        readThrough.set(room.id, Math.max(readThrough.get(room.id) || 0, room.lastReadMessageId || 0));
        messages = new Map();
        input.value = drafts.get(room.id) || '';
        input.placeholder = '메시지 입력 (Enter로 전송, Shift+Enter로 줄바꿈)';
        readStatus.textContent = '';
        document.getElementById('conversation-title').textContent = room.name;
        document.getElementById('chat-empty').hidden = true;
        list.hidden = false;
        render();
        updateControls();
        loadHistory();
        input.focus();
    });
    client.socket.on('message:new', (message) => {
        console.info('[Chat] Message received', { roomId: message.roomId, messageId: message.id, senderId: message.senderId });
        if (message.roomId !== room?.id) return;
        const stickToBottom = atBottom();
        messages.set(message.id, message);
        render(stickToBottom);
    });
    client.socket.on('room:read', ({ roomId, lastReadMessageId }) => {
        console.info('[Chat] Read progress received', { roomId, lastReadMessageId });
        readThrough.set(roomId, Math.max(readThrough.get(roomId) || 0, lastReadMessageId));
    });
    list.addEventListener('scroll', markRead);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) markRead();
    });
    retry.addEventListener('click', loadHistory);
    input.addEventListener('input', updateControls);
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            if (!send.disabled) form.requestSubmit();
        }
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (sending || !room || !client.isReady() || !input.value.trim()) return;
        const selectedRoom = room.id;
        const selectedVersion = selectionVersion;
        const text = input.value;
        sending = true;
        updateControls();
        status.textContent = '전송 중…';
        console.info('[Chat] Sending message', { roomId: selectedRoom });
        try {
            const result = await client.socket.timeout(10_000).emitWithAck('message:send', { roomId: selectedRoom, text });
            if (!result.ok) throw new Error(result.error.message);
            console.info('[Chat] Message sent', { roomId: selectedRoom, messageId: result.message.id });
            if (drafts.get(selectedRoom) === text) drafts.delete(selectedRoom);
            if (selectionVersion !== selectedVersion) return;
            messages.set(result.message.id, result.message);
            render(true);
            input.value = '';
            status.textContent = '';
        } catch (error) {
            console.warn('[Chat] Message send failed', { roomId: selectedRoom, error: error.message });
            if (selectionVersion === selectedVersion) status.textContent = error.message === 'operation has timed out'
                ? '전송 결과를 확인하지 못했습니다. 다시 보내기 전에 대화방을 다시 열어 확인해 주세요.' : error.message;
        } finally {
            sending = false;
            updateControls();
        }
    });
    updateControls();
})();
