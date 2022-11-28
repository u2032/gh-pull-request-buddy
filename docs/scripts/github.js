/**
 * The GhClient implements the requests made to the GitHub GraphQL API
 */
const GhClient = {

    /**
     * This method makes a call to the GraphQL GitHub API
     * @param _token
     * @param _query
     * @returns {Promise<boolean|*>}
     */
    request: async function (_token, _query) {
        const response = await fetch("https://api.github.com/graphql",
            {
                method: 'POST',
                cache: 'no-cache',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github+json',
                    'Authorization': 'Bearer ' + _token,
                    // 'X-Github-Next-Global-ID': 1 // TODO Set 1 when the CORS Policy is fixed on github side, for now this header is blocked
                },
                redirect: 'follow',
                body: JSON.stringify({query: _query})
            });

        if (response.ok) {
            let raw = (await response.json())
            if (raw.errors !== undefined) {
                console.error("[GH]: " + response.status + " when calling GraphQL with query: " + _query + "\nErrors: " + JSON.stringify(raw.errors));
                return false;
            }
            // console.debug("[GH] Response: " + JSON.stringify(raw.data))
            return raw.data;
        } else {
            console.error("[GH]: " + response.status + " when calling GraphQL with query: " + _query);
            return false;
        }
    },

    getRateLimit: async function (_token) {
        let response = await this.request(_token, `{viewer { login } rateLimit { limit cost remaining resetAt }}`);
        if (response === false) {
            return false;
        }
        return response.rateLimit;
    },

    getUserInfo: async function (_token) {
        let response = await this.request(_token, `{ viewer { id login name avatarUrl } }`);
        if (response === false) {
            return false;
        }
        return response.viewer;
    },

    getOrganizationInfo: async function (_token, _userLogin) {
        let response = await this.request(_token, `{viewer { organizations(first: 100) { nodes { id login name avatarUrl teams(first:100, userLogins: "${_userLogin}") { nodes { id name } }  } } } }`);
        if (response === false) {
            return false;
        }
        let organizations = [];
        for (let iorg of response.viewer.organizations.nodes) {
            let teams = []
            for (let iteam of iorg.teams.nodes) {
                let team = {id: iteam.id, name: iteam.name}
                teams.push(team)
            }
            let org = {id: iorg.id, login: iorg.login, name: iorg.name, avatarUrl: iorg.avatarUrl, teams: teams}
            organizations.push(org);
        }
        return organizations;
    },

    getRepositoriesInfo: async function (_token) {
        let response = null
        let cursor = null
        const repositories = [];
        do {
            console.debug(`Fetching ${repositories.length} +100 repositories...`)
            response = await this.request(_token, `{ viewer { repositories(first: 100, after: ${cursor === null ? cursor : `\"${cursor}\"`}, affiliations:[OWNER, ORGANIZATION_MEMBER, COLLABORATOR], ownerAffiliations:[OWNER, ORGANIZATION_MEMBER, COLLABORATOR]) { totalCount pageInfo { hasNextPage endCursor } nodes { id name nameWithOwner pushedAt isArchived isDisabled owner { id login avatarUrl } pullRequests(last: 1, states: OPEN) { nodes { id createdAt updatedAt } } } } } }`)
            cursor = response.viewer.repositories.pageInfo.endCursor
            for (let iorg of response.viewer.repositories.nodes) {
                if (iorg.isDisabled || iorg.isArchived) {
                    continue;
                }
                let pushedAt = iorg.pushedAt;
                if (iorg.pullRequests.nodes.length > 0) {
                    // If there is a last pull request still opened, take its date if more recent
                    if (new Date(iorg.pullRequests.nodes[0].createdAt) > new Date(pushedAt)) {
                        pushedAt = iorg.pullRequests.nodes[0].createdAt;
                    }
                    if (new Date(iorg.pullRequests.nodes[0].updatedAt) > new Date(pushedAt)) {
                        pushedAt = iorg.pullRequests.nodes[0].updatedAt;
                    }
                }
                let repository = {
                    id: iorg.id,
                    name: iorg.name,
                    fullname: iorg.nameWithOwner,
                    updatedAt: pushedAt,
                    hasPullRequests: iorg.pullRequests.nodes.length > 0,
                    owner: {id: iorg.owner.id, login: iorg.owner.login, avatarUrl: iorg.owner.avatarUrl}
                }
                repositories.push(repository)
            }
        } while (response !== false && response.viewer.repositories.pageInfo.hasNextPage)
        return repositories;
    },

    getPullRequestInfo: async function (_token, _repository) {
        const response = await this.request(_token, `{ node(id: \"${_repository.id}\") { id ... on Repository { name pullRequests(first: 100, states: OPEN) { nodes { id title number state isDraft createdAt url author { login avatarUrl ... on User { id name } } reviews(first:100, states:[APPROVED,CHANGES_REQUESTED]) { nodes { id state author { login avatarUrl ... on User { id name } } } } reviewRequests(first:100) { nodes { id asCodeOwner requestedReviewer { ... on Team { id name } ... on User { id login name avatarUrl } } } } } } } } }`)
        if (response === false) {
            return false;
        }
        const pullRequests = []
        for (let ipr of response.node.pullRequests.nodes) {
            let author = {
                id: ipr.author.id,
                login: ipr.author.login,
                name: ipr.author.name,
                avatarUrl: ipr.author.avatarUrl
            }

            let reviews = []
            // Add request reviews
            for (let ireview of ipr.reviewRequests.nodes) {
                let review = {
                    id: ireview.requestedReviewer.id,
                    login: ireview.requestedReviewer.login,
                    name: ireview.requestedReviewer.name,
                    avatarUrl: ireview.requestedReviewer.avatarUrl,
                    state: "REQUESTED",
                    asCodeOwner: ireview.asCodeOwner
                }
                reviews = reviews.filter(r => r.id !== review.id) // Keep only the last review per user
                reviews.push(review);
            }

            // Add made reviews
            for (let ireview of ipr.reviews.nodes) {
                if (ireview.author === null) {
                    continue;
                }
                let review = {
                    id: ireview.author.id,
                    login: ireview.author.login,
                    name: ireview.author.name,
                    avatarUrl: ireview.author.avatarUrl,
                    state: ireview.state,
                    asCodeOwner: ireview.asCodeOwner
                }
                reviews = reviews.filter(r => r.id !== review.id) // Keep only the last review per user
                reviews.push(review);
            }

            let pullRequest = {
                id: ipr.id,
                title: ipr.title,
                number: ipr.number,
                createdAt: ipr.createdAt,
                state: ipr.state,
                draft: ipr.isDraft,
                url: ipr.url,
                author: author,
                repository: _repository,
                reviews: reviews
            }
            pullRequests.push(pullRequest)
        }
        return pullRequests;
    }
}

/**
 * This object keep the data retrieve for the API, handles it and emit events accordingly
 */
const GhContext = {

    /* Serialization version, useful to invalidate stored data if the format has changed */
    version: "2022_11_27",

    lastCheck: null,
    running: false,

    /* gh_token use for the connection */
    gh_token: null,

    /* Information about the logged user */
    user: {
        id: null,
        login: null,
        name: null,
        avatarUrl: null
    },

    /* Ids of the teams the logged user is part of */
    team_ids: [],

    /* List of the organization that the logged user is part of */
    organisations: [], // { id, login, name, avatarUrl }

    /* List of all the repositories that the user can read */
    repositories: [],  // { id, fullname, name, updatedAt, owner }

    /* List of all the pull requests opened on those repositories */
    pull_requests: [], // { id, number, title, state, url, draft, createdAt, closed_at, merged_at, matching, author, repository, reviews }

    /* Filter's name and status */
    filters: {},

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
        await this.storeInLocalStorage()
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
        this.user.avatarUrl = null;
        this.gh_token = _token;

        console.debug("Connecting to github ...")
        const response = await GhClient.getUserInfo(this.gh_token)
        if (false !== response) {
            this.user.id = response.id;
            this.user.login = response.login;
            this.user.name = response.name;
            this.user.avatarUrl = response.avatarUrl;
        }

        const event = new CustomEvent('gh_connection', {detail: {isConnected: this.isConnected()}});
        window.document.dispatchEvent(event);
    },

    isConnected: function () {
        return this.user.id !== null;
    },

    refreshPullRequests: async function () {
        try {
            this.running = true;
            await GhContext.checkPullRequests();
            await GhContext.storeInLocalStorage();
        } finally {
            this.running = false;
        }
    },

    startScheduler: function () {
        setInterval(function () {
                if (GhContext.running) {
                    // An update is already running, do nothing
                    return;
                }
                let nextCheck = new Date(GhContext.lastCheck.getTime() + (1000 * 60 * 10)) // Update each 10 min
                if (new Date() > nextCheck) {
                    try {
                        GhContext.refreshPullRequests();
                    } catch (_e) {
                        console.error("Error caught during refreshing data: " + _e)
                    }
                }
            },
            1000 * 60 // Run every minute
        );
    },

    checkOrganizations: async function () {
        dispatchStatusMessage("Retrieving user's orgs & teams...");
        const orgs = await GhClient.getOrganizationInfo(this.gh_token, this.user.login)
        if (false !== orgs) {
            this.organisations = [];
            this.team_ids = [];
            orgs.forEach(o => {
                this.organisations.push(o);
                o.teams.forEach(t => {
                    this.team_ids.push(t.id)
                })
            })
            window.document.dispatchEvent(new CustomEvent('gh_organizations', {
                detail: {
                    orgs: this.organisations,
                    user: this.user
                }
            }));
        }
    },

    checkPullRequests: async function () {
        dispatchStatusMessage("Fetching Repositories...");
        const now = new Date()

        const repositories = await GhClient.getRepositoriesInfo(this.gh_token);
        this.repositories = repositories;

        const repoToCheck = []
        const repoToCheckIds = []
        for (let iorg of repositories) {
            if (false === iorg.hasPullRequests) {
                // Ignore this repository if no pull request is opened
                continue;
            }
            if (this.lastCheck !== null && new Date(iorg.updatedAt) < this.lastCheck) {
                // Ignore this repository if no push has been made since last check
                continue;
            }
            repoToCheck.push(iorg)
            repoToCheckIds.push(iorg.id);
        }

        // Force check for known pull request
        for (const pr of this.pull_requests) {
            if (!repoToCheckIds.includes(pr.repository.id)) {
                repoToCheck.push(pr.repository);
                repoToCheckIds.push(pr.repository.id);
            }
        }
        console.debug(`${repoToCheck.length} repositories need to be checked`)

        const pullRequests = []
        let i = 0;
        for (let irepo of repoToCheck) {
            i = i + 1;
            dispatchStatusMessage(`Checking repository: ${irepo.fullname} [${i} of ${repoToCheck.length}]`);

            const openedPullRequests = await GhClient.getPullRequestInfo(this.gh_token, irepo);

            for (let ipr of openedPullRequests) {
                ipr.reviews.sort((a, b) => {
                    let isTeamA = a.login === undefined;
                    let isTeamB = b.login === undefined;
                    if (isTeamA && !isTeamB) {
                        return -1;
                    }
                    if (!isTeamA && isTeamB) {
                        return 1;
                    }
                    let loginA = isTeamA ? a.name.toUpperCase() : a.login.toUpperCase()
                    let loginB = isTeamB ? b.name.toUpperCase() : b.login.toUpperCase()
                    if (loginA < loginB) {
                        return -1;
                    }
                    if (loginA > loginB) {
                        return 1;
                    }
                    return 0;
                });

                let matching = null;
                for (let ireview of ipr.reviews) {
                    // Check if a review request is pending for a team of the user
                    if (ireview.login === undefined) { // is team
                        if (this.team_ids.includes(ireview.id)) {
                            matching = "team";
                        }
                    }
                    // Check if a review request is pending for the user
                    if (ireview.id === this.user.id) {
                        matching = "direct";
                    }
                }

                // Check if the user is the author of the review
                if (ipr.author.id === this.user.id) {
                    matching = "direct";
                }

                if (matching === null) {
                    // No matching found, ignore this PR
                    continue;
                }
                ipr.matching = matching
                pullRequests.push(ipr)
            }
        }

        // TODO Keep the previous known PR mathching that are still not closed or merged

        this.pull_requests = pullRequests
        this.lastCheck = now
        dispatchStatusMessage("Last update: " + this.lastCheck.toLocaleString())
        window.document.dispatchEvent(new CustomEvent('gh_pull_requests', {
            detail: {
                pull_requests: this.pull_requests,
                last_check: now
            }
        }))
    },

    storeInLocalStorage: async function () {
        let fromAssociative = (assArr) => ({...assArr})

        // The user informaiton is not store in the storage
        localStorage.setItem('gh_context_version', this.version);
        localStorage.setItem('gh_context_last_check', this.lastCheck.getTime());
        localStorage.setItem('gh_context_user', JSON.stringify(this.user));
        localStorage.setItem('gh_context_team_ids', JSON.stringify(this.team_ids));
        localStorage.setItem('gh_context_organizations', JSON.stringify(this.organisations));
        localStorage.setItem('gh_context_repositories', JSON.stringify(this.repositories));
        localStorage.setItem('gh_context_pull_requests', JSON.stringify(this.pull_requests));
        localStorage.setItem('gh_context_filters', JSON.stringify(fromAssociative(this.filters)));
    },

    reloadFromLocalStorage: async function () {
        let toAssociative = (keys, values) =>
            values.reduce((acc, cv) => {
                acc[acc.shift()] = cv
                return acc;
            }, keys);

        try {
            let version = localStorage.getItem('gh_context_version');
            if (version !== this.version) {
                console.info("Version of the GhContext has changed, not reloading the existing one");
                localStorage.clear();
                return;
            }

            let user = JSON.parse(localStorage.getItem('gh_context_user') ?? "{}");
            if (user.id !== null && user.id !== undefined && user.id !== this.user.id) {
                console.info("User's id doesn't match, not reloading the existing data");
                localStorage.clear();
                return;
            }

            this.lastCheck = new Date(parseInt(localStorage.getItem('gh_context_last_check')));
            this.team_ids = JSON.parse(localStorage.getItem('gh_context_team_ids') ?? "[]");
            this.organisations = JSON.parse(localStorage.getItem('gh_context_organizations') ?? "[]");
            this.repositories = JSON.parse(localStorage.getItem('gh_context_repositories') ?? "[]");
            this.pull_requests = JSON.parse(localStorage.getItem('gh_context_pull_requests') ?? "[]");
            let filters = JSON.parse(localStorage.getItem('gh_context_filters') ?? "{}");
            this.filters = toAssociative(Object.keys(filters), Object.values(filters));

            // Retrigger events to update the view
            window.document.dispatchEvent(new CustomEvent('gh_organizations', {
                detail: {
                    orgs: this.organisations,
                    user: this.user
                }
            }));
            window.document.dispatchEvent(new CustomEvent('gh_pull_requests', {
                detail: {
                    pull_requests: this.pull_requests,
                    last_check: this.lastCheck
                }
            }));
            for (let filter in this.filters) {
                let indexOf = filter.indexOf("-");
                window.document.dispatchEvent(new CustomEvent('gh_filter_toggle', {
                    detail: {
                        type: filter.substring(0, indexOf),
                        value: filter.substring(indexOf + 1),
                        active: this.filters[filter]
                    }
                }));
            }

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