const GhContext = {

    user: {
        id: null,
        login: null,
        name: null,
        token: null
    },

    connect: async function (_token) {
        this.user.id = null;
        this.user.login = null;
        this.user.name = null;
        this.user.token = _token;

        console.debug("Connecting to github ...")
        const response = await ghGET(this.user.token, '/user')
        if (false !== response) {
            this.user.id = response.id;
            this.user.login = response.login;
            this.user.name = response.name;
        }

        const event = new CustomEvent('gh_connection', {detail: {isConnected: this.isConnected()}});
        window.document.dispatchEvent(event);
    },

    isConnected: function () {
        return this.user.id !== null;
    }
}

async function ghGET(_token, _path) {
    const response = await fetch("https://api.github.com" + _path,
        {
            method: 'GET',
            cache: 'no-cache',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github+json',
                'Authorization': 'Bearer ' + _token
            },
            redirect: 'follow'
        });

    if (response.ok) {
        console.debug("[GH CALL]: " + response.status + " when calling " + _path);
        return await response.json();
    } else {
        console.error("[GH CALL]: " + response.status + " when calling " + _path);
        return false;
    }
}