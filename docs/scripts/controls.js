const steps = ["loading", "connection", "dashboard"];
const filterTypes = ["matching", "organization"]

/* Configuration  */

function init() {
    const filters = document.querySelectorAll("button[data-filter]");
    for (const filter of filters) {
        filter.addEventListener('click', onClickFilter);
    }
}

function onClickFilter(e) {
    let button = e.target;
    if (!(button instanceof HTMLButtonElement)) {
        button = e.target.parentNode;
    }
    const type = button.getAttribute("data-filter");
    const value = button.getAttribute("data-filter-value");
    GhContext.toggleFilter(type, value);
}

/* VIEW MANAGEMENT */

function loading_step() {
    setTimeout(function () {
        steps.forEach((step) => {
            document.getElementById(step).classList.add("w3-hide");
        })
        document.getElementById("connection").classList.remove("w3-hide");
    }, 3000);
}

function connection_step() {
    document.getElementById("connection-error").classList.add("w3-hide");
    GhContext.connect(document.getElementById('gh-token').value);
    return false;
}

function dashboard_step() {
    steps.forEach((step) => {
        document.getElementById(step).classList.add("w3-hide");
    })
    document.getElementById("dashboard").classList.remove("w3-hide");
    document.getElementById("header-user").classList.remove("w3-hide");
    setTimeout(async function () {
        await GhContext.reloadFromLocalStorage();
        await GhContext.checkTeams();
        await GhContext.checkOrganizations();
        await refreshPullRequest();
        document.getElementById("dashboard-loading").classList.add("w3-hide");
    }, 500);
    return false;
}

async function refreshPullRequest() {
    try {
        await GhContext.checkRepositories();
        await GhContext.checkPullRequests();
        await GhContext.storeInLocalStorage();
    } catch (_ignored) {
    }
    setTimeout(refreshPullRequest, 1000 * 60 * 10) // refresh every 10 min
}

/* UTILITY FUNCTION */


function applyFilters() {
    const pulls = document.querySelectorAll(".pull-request-instance");
    pulls.forEach((el) => {
        let mustBeDisplayed = true;
        filterTypes.forEach(type => {
            const value = el.getAttribute("data-filter-" + type);
            if (false === GhContext.isFilterActive(type, value)) {
                mustBeDisplayed = false;
            }
        });
        if (mustBeDisplayed) {
            el.classList.remove("w3-hide");
        } else {
            el.classList.add("w3-hide");
        }
    })
    checkNoPullRequest();
}

function isOrganizationActive(_value) {
    return GhContext.isFilterActive("organization", _value);
}

function isMatchingActive(_value) {
    return GhContext.isFilterActive("matching", _value);
}

function checkNoPullRequest() {
    const noPr = document.getElementById("no-pull-request");
    const visibleElements = document.querySelectorAll("div.pull-request-instance:not(.w3-hide)");
    if (visibleElements.length > 0) {
        noPr.classList.add("w3-hide");
    } else {
        noPr.classList.remove("w3-hide");
    }
}


/* EVENT LISTENERS */

window.document.addEventListener("status_message",
    (e) => {
        document.getElementById("status-message").innerText = e.detail.message;
    }, false);

window.document.addEventListener("gh_connection",
    (e) => {
        if (e.detail.isConnected) {
            document.getElementById("user-name").innerText = GhContext.user.name;
            document.getElementById("user-login").innerText = GhContext.user.login;
            dashboard_step();
        } else {
            // Display error message
            document.getElementById("connection-error").classList.remove("w3-hide");
        }
    }, false);


window.document.addEventListener("gh_pull_request",
    (e) => {
        const pr = e.detail.pull_request;
        const lastCheck = e.detail.last_check;
        const owner = pr.repository.owner;
        const matching = pr.matching;

        // Disable loading as soon as we receive a first pull request
        document.getElementById("dashboard-loading").classList.add("w3-hide");

        // Display the pull request
        const template = document.getElementById("pull-request-template");

        const instance = template.cloneNode(true);
        instance.id = "pull-request-" + pr.id;
        instance.classList.add("pull-request-instance");
        if (isOrganizationActive(owner.login) && isMatchingActive(matching)) {
            // Put this node visible, only of the owner is selected
            instance.classList.remove("w3-hide");
        }
        instance.setAttribute("data-created", new Date(pr.created_at).getTime())
        instance.setAttribute("data-last-check", lastCheck.getTime())
        instance.setAttribute("data-filter-organization", owner.login)
        instance.setAttribute("data-filter-matching", matching)

        instance.addEventListener("click", function () {
            window.open(pr.html_url, '_blank');
        });

        const prAuthor = instance.querySelector(".pull-request-author");
        prAuthor.src = pr.author.avatar_url;
        prAuthor.title = prAuthor.alt = pr.author.login;

        const prTitle = instance.querySelector(".pull-request-title");
        prTitle.innerText = pr.title;

        const prNumber = instance.querySelector(".pull-request-number");
        prNumber.innerText = "#" + pr.number;

        const prRepo = instance.querySelector(".pull-request-repo");
        prRepo.innerText = pr.repository.full_name;

        const prOwner = instance.querySelector(".pull-request-repo-owner");
        prOwner.src = pr.repository.owner.avatar_url;
        prOwner.title = prAuthor.alt = pr.repository.owner.login;

        const prCreatedAt = instance.querySelector(".pull-request-created-at");
        prCreatedAt.innerText = new Date(pr.created_at).toLocaleString();

        // Remove the existing instance with the same ID
        const previous = document.getElementById("pull-request-" + pr.id);
        if (previous !== null) {
            previous.remove();
        }

        // Add the instance to the parent
        if (pr.closed_at === null && pr.merged_at === null) {
            const parent = document.getElementById("dashboard");
            parent.appendChild(instance);

            // Sort by creation date
            let allInstances = Array.from(parent.querySelectorAll(".pull-request-instance"));
            allInstances.sort((a, b) => {
                let createdA = parseInt(a.getAttribute("data-created"));
                let createdB = parseInt(b.getAttribute("data-created"));
                return createdB - createdA;
            });
            allInstances.forEach(function (node) {
                node.parentNode.append(node);
            });
        }

    }, false);

window.document.addEventListener("gh_organizations",
    (e) => {
        const user = e.detail.user;
        const orgs = e.detail.orgs;

        const template = document.getElementById("filter-organization-template");
        const parent = document.getElementById("filter-organization-list");

        // Add a first item for the user itself
        let instance = document.getElementById("filter-organization-" + user.login);
        if (instance === null) {
            instance = template.cloneNode(true);
            instance.id = "filter-organization-" + user.login;
            instance.setAttribute("data-filter", "organization");
            instance.setAttribute("data-filter-value", user.login);
            instance.classList.add("filter-organization-instance");
            instance.classList.remove("w3-hide");
            instance.addEventListener('click', onClickFilter);

            let img = instance.querySelector("img");
            img.src = user.avatar_url;

            let txt = instance.querySelector("span");
            txt.innerText = "@" + user.login;
        }
        parent.appendChild(instance);

        for (const org of orgs) {
            let instance = document.getElementById("filter-organization-" + org.login);
            if (instance === null) {
                instance = template.cloneNode(true);
                instance.id = "filter-organization-" + org.login;
                instance.setAttribute("data-filter", "organization");
                instance.setAttribute("data-filter-value", org.login);
                instance.classList.add("filter-organization-instance");
                instance.classList.remove("w3-hide");

                let img = instance.querySelector("img");
                img.src = org.avatar_url;

                let txt = instance.querySelector("span");
                txt.innerText = "@" + org.login;

                instance.addEventListener('click', onClickFilter);
            }
            parent.appendChild(instance);
        }

    }, false);

window.document.addEventListener("gh_pull_requests_refreshed",
    (e) => {
        const lastCheck = e.detail.last_check;

        // Remove all pull requests which were not been updated (probably merged or closed)
        const parent = document.getElementById("dashboard");
        const pulls = parent.querySelectorAll(".pull-request-instance");
        pulls.forEach(el => {
            const elLastCheck = new Date(parseInt(el.getAttribute("data-last-check")));
            if (elLastCheck < lastCheck) {
                el.remove();
            }
        });
        checkNoPullRequest();

    }, false);


window.document.addEventListener("gh_filter_toggle",
    (e) => {
        const type = e.detail.type;
        const value = e.detail.value;
        const active = e.detail.active;
        const el = document.querySelector("button[data-filter=" + type + "][data-filter-value=" + value + "]")
        if (active) {
            el.classList.remove("w3-disabled")
        } else {
            el.classList.add("w3-disabled")
        }
        applyFilters()

    }, false);