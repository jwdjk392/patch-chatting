(() => {
    const dialog = document.getElementById('room-dialog');
    const form = document.getElementById('room-form');
    const search = document.getElementById('user-search');
    const results = document.getElementById('user-results');
    const selectedList = document.getElementById('selected-users');
    const status = document.getElementById('search-status');
    const error = document.getElementById('room-error');
    const submit = document.getElementById('create-room');
    const roomList = document.getElementById('room-list');
    const roomCount = document.getElementById('room-count');
    const roomStatus = document.getElementById('room-list-status');
    const roomsEmpty = document.getElementById('rooms-empty');
    const retryRooms = document.getElementById('retry-rooms');
    let listVersion = 0;
    const selected = new Map();
    let timer;
    let version = 0;
    let request;
    let matches = [];

    async function jsonRequest(url, options = {}) {
        const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || '요청에 실패했습니다. 다시 시도해 주세요.');
        return data;
    }

    async function loadRooms() {
        const current = ++listVersion;
        roomList.setAttribute('aria-busy', 'true');
        roomStatus.textContent = '대화방을 불러오는 중…';
        retryRooms.hidden = true;
        roomsEmpty.hidden = true;
        try {
            const { rooms } = await jsonRequest('/api/chat-rooms');
            if (current !== listVersion) return;
            const cards = rooms.map((room) => {
                const card = document.createElement('li');
                card.className = 'room-card';
                const title = document.createElement('h3');
                title.textContent = room.name;
                const members = document.createElement('p');
                members.textContent = room.members.map(({ user }) => user.name?.trim() || user.username).join(', ');
                const count = document.createElement('span');
                count.textContent = `${room.members.length}명 참여 중`;
                card.append(title, members, count);
                return card;
            });
            roomList.replaceChildren(...cards);
            roomCount.textContent = String(rooms.length);
            roomsEmpty.hidden = rooms.length !== 0;
            roomStatus.textContent = '';
        } catch (failure) {
            if (current !== listVersion) return;
            roomStatus.textContent = `대화방 목록을 불러오지 못했습니다. ${failure.message}`;
            retryRooms.hidden = false;
        } finally {
            if (current === listVersion) roomList.setAttribute('aria-busy', 'false');
        }
    }

    retryRooms.addEventListener('click', loadRooms);
    loadRooms();

    function userButton(user, remove) {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${user.name || user.username} (@${user.username}) · ${user.email} · ${remove ? '제외' : '추가'}`;
        button.disabled = !remove && selected.has(user.id);
        button.addEventListener('click', () => {
            if (remove) selected.delete(user.id);
            else if (selected.size < 49) selected.set(user.id, user);
            else { error.textContent = '최대 49명을 선택할 수 있습니다.'; return; }
            error.textContent = '';
            renderUsers();
        });
        item.append(button);
        return item;
    }

    function renderUsers() {
        results.replaceChildren(...matches.map((user) => userButton(user, false)));
        selectedList.replaceChildren(...Array.from(selected.values(), (user) => userButton(user, true)));
    }

    document.getElementById('new-room').addEventListener('click', () => dialog.showModal());
    document.getElementById('cancel-room').addEventListener('click', () => dialog.close());
    search.addEventListener('input', () => {
        clearTimeout(timer);
        request?.abort();
        const current = ++version;
        const query = search.value.trim();
        matches = [];
        renderUsers();
        status.textContent = query.length < 2 ? '2자 이상 입력해 주세요.' : '검색 중…';
        if (query.length < 2) return;
        timer = setTimeout(async () => {
            request = new AbortController();
            try {
                const data = await jsonRequest(`/api/users?q=${encodeURIComponent(query)}`, { signal: request.signal });
                if (current !== version) return;
                matches = data.users;
                renderUsers();
                status.textContent = matches.length ? `${matches.length}명 검색됨 (최대 20명)` : '검색 결과가 없습니다.';
            } catch (failure) {
                if (current === version) status.textContent = failure.message;
            }
        }, 250);
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (submit.disabled) return;
        if (!selected.size) { error.textContent = '함께할 사용자를 선택해 주세요.'; return; }
        submit.disabled = true;
        error.textContent = '';
        try {
            await jsonRequest('/api/chat-rooms', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: document.getElementById('room-name').value.trim(), participantIds: [...selected.keys()] }),
            });
        } catch (failure) {
            error.textContent = failure.message;
            return;
        } finally {
            submit.disabled = false;
        }
        // Creation succeeded even if the subsequent list request fails.
        dialog.close();
        clearTimeout(timer);
        request?.abort();
        version++;
        form.reset();
        selected.clear();
        matches = [];
        renderUsers();
        status.textContent = '';
        await loadRooms();
    });
})();
