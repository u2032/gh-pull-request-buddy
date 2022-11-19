const GhContext = {

    version: "1",

    lastCheck: null,

    /* gh_token use for the connection */
    gh_token: null,

    /* Information about the logged user */
    user: {
        id: null,
        login: null,
        name: null
    },

    /* Ids of the teams the logged user is part of */
    team_ids: [],

    /* List of the organization that the logged user is part of */
    organisations: [], // { id, login, avatar_url }

    /* List of all the repositories that the user can read */
    repositories: [],  // { id, full_name, pushed_at, owner }

    /* List of all the pull requests opened on those repositories */
    pull_requests: [], // { id, number, title, state, html_url, created_at, closed_at, merged_at, matching, author, repository }

    /* Filter's name and status */
    filters: [],

    toggleFilter: async function (_type, _value) {
        let active = this.filters[_type + "-" + _value];
        if (active === undefined) {
            active = this.filters[_type + "-" + _value] = false;
        } else {
            active = this.filters[_type + "-" + _value] = !this.filters[_type + "-" + _value];
        }
        console.debug("Toggling filter: " + _type + "-" + _value + " => " + active);
        window.document.dispatchEvent(new CustomEvent('gh_filter_toggle', {
            detail: {
                type: _type,
                value: _value,
                active: active
            }
        }));
    },

    isFilterActive: function (_type, _value) {
        const filtered = this.filters[_type + "-" + _value];
        if (filtered === undefined) {
            return true;
        }
        return this.filters[_type + "-" + _value];
    },

    connect: async function (_token) {
        this.user.id = null;
        this.user.login = null;
        this.user.name = null;
        this.gh_token = _token;

        console.debug("Connecting to github ...")
        const response = await ghGET(this.gh_token, "/user")
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
    },

    checkTeams: async function () {
        dispatchStatusMessage("Retrieving user's teams...");
        const teams = await ghGET(this.gh_token, "/user/teams?per_page=100");
        if (false !== teams) {
            this.team_ids = [];
            teams.forEach((t) => {
                this.team_ids.push(t.id)
            })
        }
    },

    checkOrganizations: async function () {
        dispatchStatusMessage("Retrieving user's orgs...");
        const orgs = await ghGET(this.gh_token, "/user/orgs?per_page=100");
        if (false !== orgs) {
            this.organisations = [];
            orgs.forEach((t) => {
                this.organisations.push({id: t.id, login: t.login, avatar_url: t.avatar_url})
            })
            window.document.dispatchEvent(new CustomEvent('gh_organizations', {
                detail: {
                    orgs: this.organisations,
                    user: this.user
                }
            }));
        }
    },

    checkRepositories: async function () {
        // Fetch user's repositories
        dispatchStatusMessage("Fetching user's repositories...");
        let page = 1;
        let repositories;
        let newRepositories = [];
        do {
            repositories = await ghGET(this.gh_token, "/user/repos?per_page=100&page=" + page);
            if (false !== repositories) {
                if (repositories.length !== 0) {
                    repositories.forEach((o) => {
                        if (o.archived === false && o.disabled === false) {
                            newRepositories.push({
                                id: o.id,
                                full_name: o.full_name,
                                pushed_at: o.pushed_at,
                                owner: {id: o.owner.id, login: o.owner.login}
                            });
                        }
                    });
                }
            }
            page = page + 1;
        } while (repositories !== false && repositories.length > 0)

        this.repositories = newRepositories;
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
                if (!repositoriesToCheckIds.includes(pr.repository.id)) {
                    repositoriesToCheck.push(pr.repository);
                    repositoriesToCheckIds.push(pr.repository.id);
                }
            }
        }

        // Check the repositories
        const updatedPullRequests = [];
        for (const repository of repositoriesToCheck) {
            dispatchStatusMessage("Checking repository: " + repository.full_name);
            const pullrequests = await ghGET(this.gh_token, "/repos/" + repository.full_name + "/pulls?state=open&sort=created&direction=desc&per_page=50");
            if (false !== pullrequests) {
                prloop: for (const pr of pullrequests) {
                    for (const reviewer of pr.requested_reviewers) {
                        if (reviewer.id === this.user.id) {
                            const author = {id: pr.user.id, login: pr.user.login};
                            const prdata = {
                                id: pr.id,
                                number: pr.number,
                                title: pr.title,
                                html_url: pr.html_url,
                                state: pr.state,
                                created_at: pr.created_at,
                                closed_at: pr.closed_at,
                                merged_at: pr.merged_at,
                                matching: "direct",
                                repository: repository,
                                author: author
                            };
                            updatedPullRequests.push(prdata)
                            window.document.dispatchEvent(new CustomEvent('gh_pull_request', {
                                detail: {
                                    pull_request: prdata,
                                    last_check: now
                                }
                            }));
                            continue prloop;
                        }
                    }
                    for (const team of pr.requested_teams) {
                        if (this.team_ids.includes(team.id)) {
                            const author = {id: pr.user.id, login: pr.user.login};
                            let matching = "team";
                            if (author.id === this.user.id) {
                                // If we are the author of the Pull Request, fallback to direct matching
                                matching = "direct";
                            }
                            const prdata = {
                                id: pr.id,
                                number: pr.number,
                                title: pr.title,
                                html_url: pr.html_url,
                                state: pr.state,
                                created_at: pr.created_at,
                                closed_at: pr.closed_at,
                                merged_at: pr.merged_at,
                                matching: matching,
                                repository: repository,
                                author: author
                            };
                            updatedPullRequests.push(prdata)
                            window.document.dispatchEvent(new CustomEvent('gh_pull_request', {
                                detail: {
                                    pull_request: prdata,
                                    last_check: now
                                }
                            }));
                            continue prloop;
                        }
                    }
                }
            }
        }
        this.pull_requests = updatedPullRequests;
        this.lastCheck = now;
        dispatchStatusMessage("Last update: " + this.lastCheck.toLocaleString());
        window.document.dispatchEvent(new CustomEvent('gh_pull_requests_refreshed', {
            detail: {
                pull_requests: this.pull_requests,
                last_check: now
            }
        }));
    },

    storeInLocalStorage: async function () {
        // The user informaiton is not store in the storage
        localStorage.setItem('gh_context_version', this.version);
        localStorage.setItem('gh_context_last_check', this.lastCheck.getTime());
        localStorage.setItem('gh_context_user', JSON.stringify(this.user));
        localStorage.setItem('gh_context_team_ids', JSON.stringify(this.team_ids));
        localStorage.setItem('gh_context_organizations', JSON.stringify(this.organisations));
        localStorage.setItem('gh_context_repositories', JSON.stringify(this.repositories));
        localStorage.setItem('gh_context_pull_requests', JSON.stringify(this.pull_requests));
    },

    reloadFromLocalStorage: async function () {
        try {
            let version = localStorage.getItem('gh_context_version');
            if (version !== this.version) {
                console.info("Version of the GhContext has changed, not reloading the existing one");
                localStorage.clear();
                return;
            }

            let user = JSON.parse(localStorage.getItem('gh_context_user') ?? "[]");
            if (user.id !== null && user.id !== undefined && parseInt(user.id) !== this.user.id) {
                console.info("User's id doesn't match, not reloading the existing data");
                localStorage.clear();
                return;
            }

            this.lastCheck = new Date(parseInt(localStorage.getItem('gh_context_last_check')));
            this.team_ids = JSON.parse(localStorage.getItem('gh_context_team_ids') ?? "[]");
            this.organisations = JSON.parse(localStorage.getItem('gh_context_organizations') ?? "[]");
            this.repositories = JSON.parse(localStorage.getItem('gh_context_repositories') ?? {});
            this.pull_requests = JSON.parse(localStorage.getItem('gh_context_pull_requests') ?? {});

            // Retrigger events to update the view
            window.document.dispatchEvent(new CustomEvent('gh_organizations', {
                detail: {
                    orgs: this.organisations,
                    user: this.user
                }
            }));
            for (const prdata of this.pull_requests) {
                window.document.dispatchEvent(new CustomEvent('gh_pull_request', {
                    detail: {
                        pull_request: prdata,
                        last_check: this.lastCheck
                    }
                }));
            }
            window.document.dispatchEvent(new CustomEvent('gh_pull_requests_refreshed', {detail: {last_check: this.lastCheck}}));

            await dispatchStatusMessage("Last update: " + this.lastCheck.toLocaleString());

        } catch (_e) {
            console.error("Failed to reload from storage: " + _e);
            localStorage.clear();
        }
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