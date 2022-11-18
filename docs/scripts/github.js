const GhContext = {

    lastCheck: null,

    user: {
        id: null,
        login: null,
        name: null,
        token: null
    },

    team_ids: [],

    repositories: [],  // { id, full_name, pushed_at, owner }

    pull_requests: [], // { id, number, title, state, html_url, created_at, closed_at, merged_at, repository }

    owners: [],

    connect: async function (_token) {
        this.user.id = null;
        this.user.login = null;
        this.user.name = null;
        this.user.token = _token;

        console.debug("Connecting to github ...")
        const response = await ghGET(this.user.token, "/user")
        if (false !== response) {
            this.user.id = response.id;
            this.user.login = response.login;
            this.user.name = response.name;
            this.owners.push(this.user.login);
        }

        const event = new CustomEvent('gh_connection', {detail: {isConnected: this.isConnected()}});
        window.document.dispatchEvent(event);
    },

    isConnected: function () {
        return this.user.id !== null;
    },

    checkTeams: async function () {
        dispatchStatusMessage("Retrieving user's teams...");
        const teams = await ghGET(this.user.token, "/user/teams?per_page=100");
        if (false !== teams) {
            teams.forEach((t) => {
                this.team_ids.push(t.id)
            })
        }
    },

    checkRepositories: async function () {
        // Fetch user's repositories
        dispatchStatusMessage("Fetching user's repositories...");
        let page = 1;
        let repositories;
        let newOwners = [];
        let newRepositories = [];
        do {
            repositories = await ghGET(this.user.token, "/user/repos?per_page=100&page=" + page);
            if (false !== repositories) {
                if (repositories.length !== 0) {
                    repositories.forEach((o) => {
                        if (o.archived === false && o.disabled === false) {
                            newRepositories.push({id: o.id, full_name: o.full_name, pushed_at: o.pushed_at, owner: { id: o.owner.id, login: o.owner.login } });
                            if (!newOwners.includes(o.owner.login)) {
                                newOwners.push(o.owner.login);
                            }
                        }
                    });
                }
            }
            page = page + 1;
        } while (repositories !== false && repositories.length > 0)

        this.repositories = newRepositories;

        newOwners.sort();
        newOwners.unshift(this.user.login);
        this.owners = newOwners;
        window.document.dispatchEvent(new CustomEvent('gh_owners', {detail: {owners: this.owners}}));

        dispatchStatusMessage(this.repositories.length + " repositories found");
    },

    checkPullRequests: async function () {
        // Compute the repository to consider :
        //  - the ones where a push occured since the last check
        //  - the ones having already a pending pull request previously
        const now = new Date();
        let repositoriesToCheck = [];
        const repositoriesToCheckIds = [];
        if (this.lastCheck === null) {
            repositoriesToCheck = this.repositories;
        } else {
            for (const repository of this.repositories) {
                const pushedAt = new Date(repository.pushed_at)
                if (pushedAt > this.lastCheck) {
                    repositoriesToCheck.push(repository);
                    repositoriesToCheckIds.push(repository.id);
                }
            }
            for (const pr of this.pull_requests) {
                if(!repositoriesToCheckIds.includes(pr.repository.id)) {
                    repositoriesToCheck.push(pr.repository);
                    repositoriesToCheckIds.push(pr.repository.id);
                }
            }
        }

        // Check the repositories
        const updatedPullRequests = [];
        for (const repository of repositoriesToCheck) {
            dispatchStatusMessage("Checking repository: " + repository.full_name);
            const pullrequests = await ghGET(this.user.token, "/repos/" + repository.full_name + "/pulls?state=open&sort=created&direction=desc&per_page=50");
            if (false !== pullrequests) {
                prloop: for (const pr of pullrequests) {
                    for (const reviewer of pr.requested_reviewers) {
                        if (reviewer.id === this.user.id) {
                            const prdata = { id: pr.id, number: pr.number, title: pr.title, html_url: pr.html_url, state: pr.state, created_at: pr.created_at, closed_at: pr.closed_at, merged_at: pr.merged_at, repository: repository };
                            updatedPullRequests.push( prdata )
                            window.document.dispatchEvent(new CustomEvent('gh_pull_request', {detail: {pull_request: prdata}}));
                            continue prloop;
                        }
                    }
                    for (const team of pr.requested_teams) {
                        if (this.team_ids.includes(team.id)) {
                            const prdata = { id: pr.id, number: pr.number, title: pr.title, html_url: pr.html_url, state: pr.state, created_at: pr.created_at, closed_at: pr.closed_at, merged_at: pr.merged_at, repository: repository };
                            updatedPullRequests.push( prdata )
                            window.document.dispatchEvent(new CustomEvent('gh_pull_request', {detail: {pull_request: prdata}}));
                            continue prloop;
                        }
                    }
                }
            }
        }
        this.pull_requests = updatedPullRequests;
        this.lastCheck = now;
        window.document.dispatchEvent(new CustomEvent('gh_pull_requests', {detail: {pull_requests: this.pull_requests}}));
        dispatchStatusMessage("Last update: " + (new Date()).toLocaleString());
    }
}

async function dispatchStatusMessage(_message) {
    window.document.dispatchEvent(new CustomEvent('status_message', {detail: {message: _message}}));
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
        console.debug("[GH]: " + response.status + " when calling " + _path);
        return await response.json();
    } else {
        console.error("[GH]: " + response.status + " when calling " + _path);
        return false;
    }
}