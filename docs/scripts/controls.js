const steps = ["loading", "connection", "dashboard"];

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
        if (GhContext.isConnected()) {
            await GhContext.checkTeams();
            await GhContext.checkRepositories();
            await GhContext.checkPullRequests();
            setTimeout(refreshPullRequest, 1000 * 60 * 10)
        }
    }, 500);
    return false;
}

async function refreshPullRequest() {
    if (GhContext.isConnected()) {
        await GhContext.checkPullRequests();
        setTimeout(refreshPullRequest, 1000 * 60 * 10)
    }
}

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

        // Disable loading as soon as we receive a first pull request
        document.getElementById("dashboard-loading").classList.add("w3-hide");

        // Display the pull request
        const template = document.getElementById("pull-request-template");

        const instance = template.cloneNode(true);
        instance.id = "pull-request-" + pr.id;
        instance.classList.remove("w3-hide");

        const prTitle = instance.querySelector("#pull-request-title");
        prTitle.id = "pull-request-title-" + pr.id;
        prTitle.innerText = pr.title;

        const prNumber = instance.querySelector("#pull-request-number");
        prNumber.id = "pull-request-number-" + pr.id;
        prNumber.innerText = "#" + pr.number;

        const prRepo = instance.querySelector("#pull-request-repo");
        prRepo.id = "pull-request-repo-" + pr.id;
        prRepo.innerText = pr.repository.full_name;

        // Remove the existing instance with the same ID
        const previous = document.getElementById("pull-request-" + pr.id);
        if (previous !== null) {
            previous.remove();
        }

        // Add the instance to the parent
        if (pr.closed_at === null && pr.merged_at === null) {
            const parent = document.getElementById("dashboard");
            parent.appendChild(instance);
        }
    }, false);

