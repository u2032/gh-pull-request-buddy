const GH_SCHEDULER_DELAY = 1000 * 60 * 8; // 8 minutes

/**
 * The GhClient implements the requests made to the GitHub GraphQL API
 */
const GhClient = {

    rateLimit: {
        remaining: null,
        resetAt: null,
        min: 100000,
    },

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

            if (raw.data.rateLimit !== undefined) {
                this.rateLimit.remaining = raw.data.rateLimit.remaining
                this.rateLimit.resetAt = new Date(raw.data.rateLimit.resetAt)
                if (this.rateLimit.remaining < this.rateLimit.min) {
                    this.rateLimit.min = this.rateLimit.remaining
                }
            }

            // console.debug("[GH] Response: " + JSON.stringify(raw.data))
            return raw.data;
        } else {
            console.error("[GH]: " + response.status + " when calling GraphQL with query: " + _query);
            return false;
        }
    },

    getUserInfo: async function (_token) {
        let response = await this.request(_token, `{ rateLimit { remaining resetAt } viewer { id login name avatarUrl } }`);
        if (response === false) {
            return false;
        }
        return response.viewer;
    },

    getOrganizationInfo: async function (_token, _userLogin) {
        let response = await this.request(_token, `{ rateLimit { remaining resetAt } viewer { organizations(first: 100) { nodes { id login name avatarUrl teams(first:100, userLogins: "${_userLogin}") { nodes { id name } }  } } } }`);
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
            response = await this.request(_token, `{ rateLimit { remaining resetAt } viewer { repositories(first: 100, after: ${cursor === null ? cursor : `\"${cursor}\"`}, affiliations:[OWNER, ORGANIZATION_MEMBER, COLLABORATOR], ownerAffiliations:[OWNER, ORGANIZATION_MEMBER, COLLABORATOR]) { totalCount pageInfo { hasNextPage endCursor } nodes { id name nameWithOwner pushedAt isArchived isDisabled repositoryTopics(first:10) { nodes { topic { name } } } owner { id login avatarUrl } pullRequests(last: 1, states: OPEN) { nodes { id createdAt updatedAt } } } } } }`)
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
                let topics = []
                for (let itopic of iorg.repositoryTopics.nodes) {
                    topics.push(itopic.topic.name)
                }
                let repository = {
                    id: iorg.id,
                    name: iorg.name,
                    fullname: iorg.nameWithOwner,
                    updatedAt: pushedAt,
                    hasPullRequests: iorg.pullRequests.nodes.length > 0,
                    topics: topics,
                    owner: {id: iorg.owner.id, login: iorg.owner.login, avatarUrl: iorg.owner.avatarUrl}
                }
                repositories.push(repository)
            }
        } while (response !== false && response.viewer.repositories.pageInfo.hasNextPage)
        return repositories;
    },

    getPullRequestInfos: async function (_token, _repository) {
        const response = await this.request(_token, `{ rateLimit { remaining resetAt } node(id: \"${_repository.id}\") { id ... on Repository { name pullRequests(last: 100, states: OPEN) { nodes { id title number state isDraft createdAt url author { login avatarUrl ... on User { id name } } labels(first:10) { nodes { name } } assignees(first:10) { nodes { id login name avatarUrl } } reviews(last:100) { nodes { id state author { login avatarUrl ... on User { id name } } } } reviewRequests(last:100) { nodes { id asCodeOwner requestedReviewer { ... on Team { id name } ... on User { id login name avatarUrl } } } } } } } } }`)
        if (response === false) {
            return false;
        }
        const pullRequests = []
        for (let ipr of response.node.pullRequests.nodes) {
            let pullRequest = this.extractPullRequestInfo(_repository, ipr);
            pullRequests.push(pullRequest)
        }
        return pullRequests;
    },

    getPullRequestInfo: async function (_token, _repository, _pullRequest) {
        const response = await this.request(_token, `{ rateLimit { remaining resetAt } node(id: \"${_pullRequest.id}\") { id ... on PullRequest { id title number state isDraft createdAt url author { login avatarUrl ... on User { id name } } labels(first:10) { nodes { name } } assignees(first:10) { nodes { id login name avatarUrl } } reviews(last:100) { nodes { id state onBehalfOf(first:10) { nodes { id name } } author { login avatarUrl ... on User { id name } } } } reviewRequests(last:100) { nodes { id asCodeOwner requestedReviewer { ... on Team { id name } ... on User { id login name avatarUrl } } } } } } }`)
        if (response === false) {
            return false;
        }
        let pullRequest = this.extractPullRequestInfo(_repository, response.node);
        return pullRequest;
    },

    extractPullRequestInfo: function (_repository, ipr) {
        let author = {
            id: ipr.author.id,
            login: ipr.author.login,
            name: ipr.author.name,
            avatarUrl: ipr.author.avatarUrl
        }

        let reviews = []
        // Add made review on behalf of
        for (let ireview of ipr.reviews.nodes) {
            if (ireview.onBehalfOf === undefined) {
                break;
            }
            for (let iobf of ireview.onBehalfOf.nodes) {
                let review = {
                    id: iobf.id,
                    name: iobf.name,
                    state: "TEAM"
                }
                reviews = reviews.filter(r => r.id !== review.id) // Remove the previous reviews from this user
                reviews.push(review);
            }
        }

        // Add request reviews
        for (let ireview of ipr.reviewRequests.nodes) {
            let review = {
                id: ireview.requestedReviewer.id,
                login: ireview.requestedReviewer.login,
                name: ireview.requestedReviewer.name,
                avatarUrl: ireview.requestedReviewer.avatarUrl,
                state: ireview.requestedReviewer.login !== undefined ? "REQUESTED" : "TEAM"
            }
            reviews = reviews.filter(r => r.id !== review.id) // Remove the previous reviews from this user
            reviews.push(review);
        }

        // Add made reviews
        for (let ireview of ipr.reviews.nodes) {
            if (ireview.author === null) {
                continue;
            }
            if (author.id === ireview.author.id) {
                // Ignore this review if the review is made by the PR's author (usually a comment)
                continue;
            }

            let status = ireview.state
            if (status === "COMMENTED" || status === "DISMISSED") {
                // Fallback to REQUESTED if commented or dismissed
                status = "REQUESTED"
            }

            let review = {
                id: ireview.author.id,
                login: ireview.author.login,
                name: ireview.author.name,
                avatarUrl: ireview.author.avatarUrl,
                state: status
            }
            let previousReview = reviews.find(r => r.id === review.id);
            if (previousReview === undefined) {
                reviews.push(review);
                continue;
            }
            if ((review.state === "PENDING" || review.state === "REQUESTED") && (previousReview.state === "APPROVED" || previousReview.state === "CHANGES_REQUESTED")) {
                // If the last review is still in pending or requested, keep the last in approved or changes_requested status instead
                review = previousReview
            }
            reviews = reviews.filter(r => r.id !== review.id) // Remove the previous reviews from this user
            reviews.push(review);
        }

        // Add request assignees
        let assignees = []
        for (let iassignee of ipr.assignees.nodes) {
            let assignee = {
                id: iassignee.id,
                login: iassignee.login,
                name: iassignee.name,
                avatarUrl: iassignee.avatarUrl
            }
            assignees.push(assignee);
        }

        // Add labels
        let labels = []
        for (let ilabel of ipr.labels.nodes) {
            let label = {
                name: ilabel.name
            }
            labels.push(label);
        }

        return {
            id: ipr.id,
            title: ipr.title,
            number: ipr.number,
            createdAt: ipr.createdAt,
            state: ipr.state,
            draft: ipr.isDraft,
            url: ipr.url,
            author: author,
            repository: _repository,
            labels: labels,
            assignees: assignees,
            reviews: reviews
        };
    }
}

/**
 * This object keep the data retrieve for the API, handles it and emit events accordingly
 */
const GhContext = {

    /* Serialization version, useful to invalidate stored data if the format has changed */
    version: "2022_12_06",

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

    /* This list holds the PR ids that are known and didn't match */
    pull_requests_no_matching: [],

    /* This list holds the PR ids that were marked as ignored */
    pull_requests_ignored: [],

    /* Filter's name and status */
    filters: {},

    /* Preferred sort option */
    sortBy: "created",

    /* Offset used for the onbehalf feature which is costly */
    onBehalfOffset: 0,

    toggleFilter: async function (_type, _value, _state) {
        this.filters[_type + "-" + _value] = _state;
        console.debug("Toggling filter: " + _type + "-" + _value + " => " + _state);
        window.document.dispatchEvent(new CustomEvent('gh_filter_toggle', {
            detail: {
                type: _type,
                value: _value,
                active: _state
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

    markAsIgnored: function (_pr) {
        this.pull_requests_ignored.push(this.pullRequestToKey(_pr))
    },

    isIgnored: function (_pr) {
        return this.pull_requests_ignored.includes(this.pullRequestToKey(_pr))
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

            let {openedPullRequests, pullRequestsToCheck} = await GhContext.checkPullRequests();
            await GhContext.storeInLocalStorage();

            await GhContext.checkFullPullRequestInfos(openedPullRequests, pullRequestsToCheck)
            await GhContext.storeInLocalStorage();

            await GhContext.cleanUpIgnoreList(openedPullRequests)
            await GhContext.storeInLocalStorage();

        } finally {
            this.running = false;
        }
    },

    startScheduler: function () {
        setInterval(async function () {
                if (GhContext.running) {
                    // An update is already running, do nothing
                    return;
                }
                if (GhContext.lastCheck === null || new Date() > new Date(GhContext.lastCheck.getTime() + GH_SCHEDULER_DELAY)) {
                    try {
                        await GhContext.refreshPullRequests();
                    } catch (_e) {
                        console.error("Error caught during refreshing data: " + _e)
                    }
                }
            },
            1000 * 60 // Run every minute
        );
    },

    checkOrganizations: async function () {
        await dispatchStatusMessage("Retrieving user's orgs & teams...");
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

    checkRepositories: async function () {
        const now = new Date()
        await dispatchStatusMessage("Fetching Repositories...");

        this.repositories = await GhClient.getRepositoriesInfo(this.gh_token);
        this.repositories.sort((a, b) => {
            if (a.fullname < b.fullname) {
                return -1;
            }
            if (a.fullname > b.fullname) {
                return 1;
            }
            return 0;
        })

        const repoToCheck = []
        const repoToCheckIds = []
        for (let iorg of this.repositories) {
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

        return {date: now, repoToCheck: repoToCheck}
    },

    checkPullRequests: async function () {
        let result = await GhContext.checkRepositories();

        const now = result.date
        const repoToCheck = result.repoToCheck;

        const pullRequests = []
        const openedPullRequests = []
        const pullRequestsToCheck = []
        let i = 0;
        for (let irepo of repoToCheck) {
            i = i + 1;
            await dispatchStatusMessage(`Checking repository: ${irepo.fullname} [${i} of ${repoToCheck.length}]`);

            const openedPullRequestsInRepo = await GhClient.getPullRequestInfos(this.gh_token, irepo);

            for (let ipr of openedPullRequestsInRepo) {
                openedPullRequests.push(ipr)

                let previous = this.pull_requests.find(o => o.id === ipr.id);
                let matching = this.computeMatchingType(ipr, previous);

                if (matching === null && previous !== undefined && previous.matching !== null) {
                    // If this PR previously matched, keep it matching
                    matching = previous.matching;
                }

                if (matching === null) { // No matching found, ignore this PR but plan it for a full check
                    pullRequestsToCheck.push({repo: irepo, pull_request: ipr})
                    continue;
                }

                if (previous === undefined) { // First time we detect this PR, keep the PR but plan it for a full check
                    pullRequestsToCheck.push({repo: irepo, pull_request: ipr})
                }

                if (previous !== undefined) {
                    // If this PR was previously known, keep the team reviews if not more present
                    for (let ireview of previous.reviews) {
                        if (ireview.state === "TEAM") {
                            if (!ipr.reviews.some(r => r.id === ireview.id)) {
                                ipr.reviews.push(ireview)
                            }
                        }
                    }
                }

                // Sort reviews : first teams then people
                this.sortReviewOnPullRequest(ipr);

                ipr.matching = matching
                ipr.priority = this.computePriority(ipr)
                pullRequests.push(ipr)
            }
        }

        this.pull_requests = pullRequests
        this.lastCheck = now
        await dispatchStatusMessage("Last update: " + this.lastCheck.toLocaleString())
        window.document.dispatchEvent(new CustomEvent('gh_pull_requests', {
            detail: {
                pull_requests: this.pull_requests,
                last_check: now
            }
        }))

        return {openedPullRequests: openedPullRequests, pullRequestsToCheck: pullRequestsToCheck}
    },

    checkFullPullRequestInfos: async function (openedPullRequests, pullRequestsToCheck) {
        // Extra check for no matching Pull requests with onBehalfInfo
        let extraPrFound = false
        let j = 0;
        let prToCheck = pullRequestsToCheck.filter(p => !this.pull_requests_no_matching.includes(this.pullRequestToKey(p.pull_request))) // Remove already checked PR
        for (let inm of prToCheck) {
            j = j + 1
            if (j % 50 === 0) {
                await GhContext.storeInLocalStorage(); // Store in local storage every 50 checks
            }
            await dispatchStatusMessage(`Extra checks: [${j} of ${prToCheck.length}]`)

            let fullPullRequestInfo = await GhClient.getPullRequestInfo(this.gh_token, inm.repo, inm.pull_request);
            let matching = this.computeMatchingType(fullPullRequestInfo, undefined)
            if (matching === null) {
                this.pull_requests_no_matching.push(this.pullRequestToKey(inm.pull_request))
            } else {
                console.debug(`Selecting PR from onBehalf: ${inm.repo.fullname} / ${fullPullRequestInfo.title}`)
                this.sortReviewOnPullRequest(fullPullRequestInfo);
                fullPullRequestInfo.matching = matching
                fullPullRequestInfo.priority = this.computePriority(fullPullRequestInfo)
                this.pull_requests = this.pull_requests.filter(p => p.id !== fullPullRequestInfo.id) // Remove the existing one if needed
                this.pull_requests.push(fullPullRequestInfo)
                extraPrFound = true
            }
        }

        await dispatchStatusMessage("Last update: " + this.lastCheck.toLocaleString())
        if (extraPrFound) {
            window.document.dispatchEvent(new CustomEvent('gh_pull_requests', {
                detail: {
                    pull_requests: this.pull_requests,
                    last_check: this.lastCheck
                }
            }))
        }

        // Cleanup no_matching by removing the closed ones
        this.pull_requests_no_matching = this.pull_requests_no_matching.filter(key => {
            let {repoId, pullRequestId} = this.pullRequestFromKey(key)
            return !openedPullRequests.some(k => k.repository.id === repoId) // We didn't check this repository
                || openedPullRequests.some(k => k.id === pullRequestId) // or the PR is still opened
        });
    },

    cleanUpIgnoreList: function (openedPullRequests) {
        this.pull_requests_ignored = this.pull_requests_ignored.filter(key => {
            let {repoId, pullRequestId} = this.pullRequestFromKey(key)
            return !openedPullRequests.some(k => k.repository.id === repoId) // We didn't check this repository
                || openedPullRequests.some(k => k.id === pullRequestId) // or the PR is still opened
        });
    },

    pullRequestToKey: function (pr) {
        return `${pr.repository.id}::${pr.id}`
    },

    pullRequestFromKey: function (key) {
        let info = key.split("::");
        return {repoId: info[0], pullRequestId: info[1]}
    },

    computePriority: function (ipr) {
        let priority = "low";

        let oldDelay = Math.floor(1000 * 60 * 60 * 24 * 3.5) // = 3.5 days
        let isOld = new Date(new Date(ipr.createdAt).getTime() + oldDelay) < new Date()

        let matching = ipr.matching
        if (matching !== undefined) {
            if (matching === 'direct') {
                priority = isOld ? "highest" : "high"
            } else if (matching === 'team') {
                priority = isOld ? "high" : "low"
            }
        }

        for (let ilabel of ipr.labels) {
            if (ilabel.name === "dependencies") {
                priority = "lowest"
            }
        }

        return priority;
    },

    computeMatchingType: function (ipr, previous) {
        // Check if the user is the author of the review
        if (ipr.author.id === this.user.id) {
            return "direct";
        }

        // Check assignee
        for (let iassignee of ipr.assignees) {
            if (iassignee.id === this.user.id) {
                return "direct";
            }
        }

        if (previous !== undefined && previous.matching === "team") {
            // If this PR previously matched by TEAM, keep that value
            return "team";
        } else {
            // Check if a review is related to the user
            for (let ireview of ipr.reviews) {
                if (ireview.id === this.user.id) {
                    return "direct";
                }
            }

            // Check if a review request is related to a team of the user
            for (let ireview of ipr.reviews) {
                if (ireview.state === "TEAM") {
                    if (this.team_ids.includes(ireview.id)) {
                        return "team";
                    }
                }
            }
        }

        return null;
    },

    sortReviewOnPullRequest: function (ipr) {
        ipr.reviews.sort((a, b) => {
            if (a.state === "TEAM" && b.state !== "TEAM") {
                return -1;
            }
            if (a.state !== "TEAM" && b.state === "TEAM") {
                return 1;
            }
            let loginA = a.state === "TEAM" ? a.name.toUpperCase() : a.login.toUpperCase()
            let loginB = b.state === "TEAM" ? b.name.toUpperCase() : b.login.toUpperCase()
            if (loginA < loginB) {
                return -1;
            }
            if (loginA > loginB) {
                return 1;
            }
            return 0;
        });
    },

    clearLocalStorage: async function () {
        localStorage.clear()
    },

    storeInLocalStorage: async function () {
        let fromAssociative = (assArr) => ({...assArr})

        // The user informaiton is not store in the storage
        localStorage.setItem('gh_context_version', this.version);
        localStorage.setItem('gh_context_last_check', this.lastCheck !== null ? this.lastCheck.getTime() : 0);
        localStorage.setItem('gh_context_user', JSON.stringify(this.user));
        localStorage.setItem('gh_context_team_ids', JSON.stringify(this.team_ids));
        localStorage.setItem('gh_context_organizations', JSON.stringify(this.organisations));
        localStorage.setItem('gh_context_repositories', JSON.stringify(this.repositories));
        localStorage.setItem('gh_context_pull_requests', JSON.stringify(this.pull_requests));
        localStorage.setItem('gh_context_pull_requests_no_matching', JSON.stringify(this.pull_requests_no_matching));
        localStorage.setItem('gh_context_pull_requests_ignored', JSON.stringify(this.pull_requests_ignored));
        localStorage.setItem('gh_context_filters', JSON.stringify(fromAssociative(this.filters)));
        localStorage.setItem('gh_context_sort_by', this.sortBy);
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
            this.pull_requests_no_matching = JSON.parse(localStorage.getItem('gh_context_pull_requests_no_matching') ?? "[]");
            this.pull_requests_ignored = JSON.parse(localStorage.getItem('gh_context_pull_requests_ignored') ?? "[]");
            let filters = JSON.parse(localStorage.getItem('gh_context_filters') ?? "{}");
            this.filters = toAssociative(Object.keys(filters), Object.values(filters));
            this.sortBy = localStorage.getItem('gh_context_sort_by') ?? "created";

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
    },

    computeStorageSize: function () {
        let _lsTotal = 0,
            _xLen, _x;
        for (_x in localStorage) {
            if (!localStorage.hasOwnProperty(_x)) {
                continue;
            }
            _xLen = ((localStorage[_x].length + _x.length) * 2);
            _lsTotal += _xLen;
            console.log(_x.substr(0, 50) + " = " + (_xLen / 1024).toFixed(2) + " KB")
        }
        console.log("Total = " + (_lsTotal / 1024).toFixed(2) + " KB");
    }
}

async function dispatchStatusMessage(_message) {
    window.document.dispatchEvent(new CustomEvent('status_message', {detail: {message: _message}}));
}