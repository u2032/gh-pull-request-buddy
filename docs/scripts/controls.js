const steps = ["loading", "connection", "dashboard"];
const matchings = ["direct", "team"];

function init() {
    for (const matching of matchings) {
        const el = document.getElementById("matching-checkbox-" + matching);
        el.addEventListener('change', e => {
            const pulls = document.querySelectorAll("div[data-matching='" + matching + "']");
            pulls.forEach( (el) => {
                filterPullRequest(el);
            })
        });
    }
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

function isOwnerActive( _owner ) {
    const checkbox = document.getElementById("owner-checkbox-" + _owner);
    return checkbox.checked;
}

function isMatchingActive( _type ) {
    const checkbox = document.getElementById("matching-checkbox-" + _type);
    return checkbox.checked;
}

function filterPullRequest( _el ) {
    const matching = _el.getAttribute("data-matching");
    const owner = _el.getAttribute("data-owner");
    if (isOwnerActive(owner) && isMatchingActive(matching)) {
        _el.classList.remove("w3-hide");
    } else {
        _el.classList.add("w3-hide");
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
        const owner = pr.repository.owner.login;
        const matching = pr.matching;

        // Disable loading as soon as we receive a first pull request
        document.getElementById("dashboard-loading").classList.add("w3-hide");

        // Display the pull request
        const template = document.getElementById("pull-request-template");

        const instance = template.cloneNode(true);
        instance.id = "pull-request-" + pr.id;
        if (isOwnerActive(owner) && isMatchingActive(matching)) {
            // Put this node visible, only of the owner is selected
            instance.classList.remove("w3-hide");
        }
        instance.setAttribute("data-created", new Date(pr.created_at).getTime())
        instance.setAttribute("data-last-check", lastCheck.getTime())
        instance.setAttribute("data-owner", owner)
        instance.setAttribute("data-matching", matching)

        const prTitle = instance.querySelector("#pull-request-title");
        prTitle.id = "pull-request-title-" + pr.id;
        prTitle.innerText = pr.title;

        const prNumber = instance.querySelector("#pull-request-number");
        prNumber.id = "pull-request-number-" + pr.id;
        prNumber.innerText = "#" + pr.number;

        const prRepo = instance.querySelector("#pull-request-repo");
        prRepo.id = "pull-request-repo-" + pr.id;
        prRepo.innerText = pr.repository.full_name;

        const prCreatedAt = instance.querySelector("#pull-request-created-at");
        prCreatedAt.id = "pull-request-created-at-" + pr.id;
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

window.document.addEventListener("gh_owners",
    (e) => {
        const owners = e.detail.owners;

        // Display the pull request
        const template = document.getElementById("owner-template");

        const pulls = document.querySelectorAll(".owner-instance");
        pulls.forEach( (el) => {
            // Remove previous owners
            if (el !== template) {
                el.remove();
            }
        })

        for (const owner of owners) {
            const instance = template.cloneNode(true);
            instance.id = "owner-" + owner;
            instance.classList.remove("w3-hide");
            instance.addEventListener('change', e => {
                const pulls = document.querySelectorAll("div[data-owner='" + owner + "']");
                pulls.forEach( (el) => {
                    filterPullRequest(el);
                })
            });

            const ownerChekbox = instance.querySelector("#owner-checkbox");
            ownerChekbox.id = "owner-checkbox-" + owner;

            const ownerLabel = instance.querySelector("#owner-label");
            ownerLabel.id = "owner-label-" + owner;
            ownerLabel.setAttribute("for", "owner-checkbox-" + owner);
            ownerLabel.innerText = "@" + owner;

            // Add the instance to the parent
            const parent = document.getElementById("owner-list");
            parent.appendChild(instance);
        }

    }, false);

window.document.addEventListener("gh_pull_requests_refreshed",
    (e) => {
        const lastCheck = e.detail.last_check;

        // Remove all pull requests which were not been updated (probably merged or closed)
        const parent = document.getElementById("dashboard");
        const pulls = parent.querySelectorAll(".pull-request-instance");
        pulls.forEach( el => {
            const elLastCheck = new Date(parseInt(el.getAttribute("data-last-check")));
            if (elLastCheck < lastCheck) {
                el.remove();
            }
        });

    }, false);