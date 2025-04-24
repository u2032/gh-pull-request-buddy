const steps = ["loading", "connection", "dashboard"];
const filterTypes = ["matching", "organization"]
const sortingOptions = ["created", "priority"]

/* Configuration  */

function init() {
    const form = document.getElementById("connection-form");
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        connection_step();
    });

    const filters = document.querySelectorAll("button[data-filter]");
    for (const filter of filters) {
        filter.addEventListener('click', onClickFilter);
    }

    const sorts = document.querySelectorAll("div[data-sortby]");
    for (const sort of sorts) {
        sort.addEventListener('click', onClickSort);
    }

    const displayHideApproved = document.getElementById("display-hide-approved");
    displayHideApproved.addEventListener('click', onClickDisplayHideApproved)

    const actionLogout = document.getElementById("action-logout")
    actionLogout.addEventListener('click', function (e) {
        document.location.reload()
    })

    const actionForgetme = document.getElementById("action-forgetme")
    actionForgetme.addEventListener('click', async function (e) {
        await GhContext.clearLocalStorage()
        document.location.reload()
    })
}

function onClickFilter(e) {
    let button = e.target;
    if (!(button instanceof HTMLButtonElement)) {
        button = e.target.parentNode;
    }
    const type = button.dataset.filter;
    const value = button.dataset.filter_value;

    const allElements = document.querySelectorAll(`button[data-filter=${type}][data-filter_value]`);
    if (value === "all") {
        // Enable all filter
        for (let el of allElements) {
            GhContext.toggleFilter(type, el.dataset.filter_value, true);
        }
    } else {
        GhContext.toggleFilter(type, value, true);
        // disable all other filters
        for (let el of allElements) {
            if (value !== el.dataset.filter_value) {
                GhContext.toggleFilter(type, el.dataset.filter_value, false);
            }
        }
    }
}

function onClickSort(e) {
    const type = e.target.dataset.sortby;

    // Save option
    GhContext.sortBy = type
    GhContext.storeInLocalStorage()

    applySorting()
}

function onClickDisplayHideApproved(e) {
    // Save new option
    if (GhContext.displayHideApproved === "enabled") {
        GhContext.displayHideApproved = "disabled";
    } else {
        GhContext.displayHideApproved = "enabled";
    }
    GhContext.storeInLocalStorage()
    applyDisplayHideApproved()
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
        await GhContext.checkOrganizations();
        await GhContext.refreshPullRequests();
        await GhContext.startScheduler();
        document.getElementById("dashboard-loading").classList.add("w3-hide");
        this.checkNoPullRequest();
    }, 500);
    return false;
}


/* UTILITY FUNCTION */

function applyFilters() {
    const pulls = document.querySelectorAll(".pull-request-instance");
    pulls.forEach((el) => {
        let mustBeDisplayed = true;
        filterTypes.forEach(type => {
            const value = el.dataset["filter_" + type];
            if (false === GhContext.isFilterActive(type, value)) {
                mustBeDisplayed = false;
            }
        });

        if (el.dataset.draft != null) {
            mustBeDisplayed = false;
        }

        if (GhContext.displayHideApproved === "enabled") {
            // Hide if approved
            let isApproved = el.classList.contains("w3-pale-green")
            if (isApproved) {
                mustBeDisplayed = false;
            }
        }

        if (mustBeDisplayed) {
            el.classList.remove("w3-hide");
        } else {
            el.classList.add("w3-hide");
        }
    })
    checkNoPullRequest();
}

function applySorting() {
    const parent = document.getElementById("dashboard");
    const sortOption = GhContext.sortBy;

    let allSortingOptions = parent.querySelectorAll(".sorting-option");
    for (let opt of allSortingOptions) {
        const type = opt.dataset.sortby
        if (type === sortOption) {
            opt.classList.remove("w3-hide")
        } else {
            opt.classList.add("w3-hide")
        }
    }

    let allInstances = Array.from(parent.querySelectorAll(".pull-request-instance"));
    allInstances.sort((a, b) => {
        let createdA = parseInt(a.dataset[sortOption]);
        let createdB = parseInt(b.dataset[sortOption]);
        return createdB - createdA;
    });
    allInstances.forEach(function (node) {
        node.parentNode.append(node);
    });
}

function applyDisplayHideApproved() {
    const parent = document.getElementById("display-hide-approved");
    const option = GhContext.displayHideApproved;

    let optEnabledIcon = parent.querySelector(".display-option-icon-enabled");
    let optDisabledIcon = parent.querySelector(".display-option-icon-disabled");
    if (option === "enabled") {
        optEnabledIcon.classList.remove("w3-hide")
        optDisabledIcon.classList.add("w3-hide")
    } else {
        optEnabledIcon.classList.add("w3-hide")
        optDisabledIcon.classList.remove("w3-hide")
    }
    applyFilters()
}

function isOrganizationActive(_value) {
    return GhContext.isFilterActive("organization", _value);
}

function isMatchingActive(_value) {
    return GhContext.isFilterActive("matching", _value);
}

function checkNoPullRequest() {
    const loading = document.getElementById("dashboard-loading");
    if (!loading.classList.contains("w3-hide")) {
        // loading is ongoing, ignore the no pull request check
        return;
    }
    const noPr = document.getElementById("no-pull-request");
    const visibleElements = document.querySelectorAll("div.pull-request-instance:not(.w3-hide)");
    const sortingOption = document.getElementById("sorting-option");
    const displayOption = document.getElementById("display-option");
    if (visibleElements.length > 0) {
        noPr.classList.add("w3-hide");
        sortingOption.classList.remove("w3-hide")
    } else {
        noPr.classList.remove("w3-hide");
        sortingOption.classList.add("w3-hide")
    }
    displayOption.classList.remove("w3-hide")
}


/* EVENT LISTENERS */

window.document.addEventListener("status_message",
    (e) => {
        document.getElementById("status-message").innerText = e.detail.message;
    });

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
    });


window.document.addEventListener("gh_pull_requests",
    (e) => {
        const parent = document.getElementById("dashboard");

        const lastCheck = e.detail.last_check
        const pullRequests = e.detail.pull_requests
        for (let pr of pullRequests) {
            if (GhContext.isIgnored(pr)) {
                continue  // Skip ignored PR
            }

            const owner = pr.repository.owner;
            const matching = pr.matching;

            // Disable loading as soon as we receive a first pull request
            document.getElementById("dashboard-loading").classList.add("w3-hide");

            // Display the pull request
            const template = document.getElementById("pull-request-template");

            const instance = template.cloneNode(true);
            instance.id = "pull-request-" + pr.id;
            instance.classList.add("pull-request-instance");
            if (!pr.draft && isOrganizationActive(owner.login) && isMatchingActive(matching)) {
                // Put this node visible, only if the owner is selected, and not draft
                instance.classList.remove("w3-hide");
            }
            instance.dataset.created = new Date(pr.createdAt).getTime().toString();
            instance.dataset.last_check = lastCheck.getTime().toString();
            instance.dataset.filter_organization = owner.login;
            instance.dataset.filter_matching = matching;
            if (pr.draft) {
                instance.dataset.draft = true;
            }

            const actionOpen = instance.querySelector(".action-open")
            actionOpen.addEventListener("click", function () {
                window.open(pr.url, '_blank');
            });

            const actionIgnore = instance.querySelector(".action-ignore")
            const actionIgnoreConfirm = instance.querySelector(".action-ignore-confirm")
            actionIgnoreConfirm.addEventListener("click", function () {
                GhContext.markAsIgnored(pr)
                instance.classList.add("w3-hide")
                GhContext.storeInLocalStorage()
            });

            const prAuthor = instance.querySelector(".pull-request-author");
            prAuthor.src = pr.author.avatarUrl;
            prAuthor.title = prAuthor.alt = pr.author.login;

            const prTitle = instance.querySelector(".pull-request-title");
            prTitle.innerText = pr.title;
            prTitle.addEventListener("click", function () {
                window.open(pr.url, '_blank');
            });

            const prNumber = instance.querySelector(".pull-request-number");
            prNumber.innerText = "#" + pr.number;

            const prRepo = instance.querySelector(".pull-request-repo");
            prRepo.innerText = pr.repository.fullname;

            const prOwner = instance.querySelector(".pull-request-repo-owner");
            prOwner.src = pr.repository.owner.avatarUrl;
            prOwner.title = prAuthor.alt = pr.repository.owner.login;

            const prCreatedAt = instance.querySelector(".pull-request-created-at");
            prCreatedAt.innerText = new Date(pr.createdAt).toLocaleString();

            const prLabelList = instance.querySelector(".pull-request-label-list");
            const prLabelTemplate = instance.querySelector(".pull-request-label-template");
            for (let ilabel of pr.labels) {
                const labelInstance = prLabelTemplate.cloneNode(true)
                labelInstance.innerText = '#' + ilabel.name
                labelInstance.title = ilabel.name
                labelInstance.classList.remove('w3-hide')
                prLabelList.appendChild(labelInstance)
            }

            const prReviewList = instance.querySelector(".pull-request-review-list");
            const prReviewTemplate = prReviewList.querySelector(".pull-request-review-template");
            let approvedByUser = false
            let approvedBySomeone = false
            let rejectedBySomeone = false
            for (let review of pr.reviews) {
                const prReviewInstance = prReviewTemplate.cloneNode(true);
                prReviewInstance.classList.replace("w3-hide", "w3-show-inline-block");

                const prReviewName = prReviewInstance.querySelector(".pull-request-review-name");
                prReviewName.innerText = (review.state === "TEAM" ? review.name : "@" + review.login);
                if (review.name != null) {
                    prReviewName.title = review.name
                }

                const prReviewIcon = prReviewInstance.querySelector(".pull-request-review-icon");
                prReviewIcon.title = review.state;
                if (review.state === "APPROVED") {
                    approvedBySomeone = true
                    if (review.id === GhContext.user.id) {
                        approvedByUser = true
                    }
                    prReviewIcon.classList.add("fa-solid", "fa-circle-check", "w3-text-green", "w3-large");
                } else if (review.state === "CHANGES_REQUESTED") {
                    rejectedBySomeone = true
                    prReviewIcon.classList.add("fa-solid", "fa-circle-xmark", "w3-text-red", "w3-large");
                } else if (review.state === "PENDING") {
                    prReviewIcon.classList.add("fa-solid", "fa-hourglass-half", "w3-text-gray");
                    prReviewName.classList.add("w3-text-gray");
                } else if (review.state === "REQUESTED") {
                    prReviewIcon.classList.add("fa-solid", "fa-minus", "w3-text-gray", "w3-tiny");
                    prReviewName.classList.add("w3-text-gray");
                } else if (review.state === "TEAM") {
                    prReviewIcon.classList.add("fa-solid", "fa-users", "w3-text-gray");
                    prReviewName.classList.add("w3-text-gray");
                } else {
                    prReviewIcon.classList.add("fa-solid", "fa-question", "w3-text-gray");
                    prReviewName.classList.add("w3-text-gray");
                }

                prReviewList.appendChild(prReviewInstance)
            }

            if (approvedByUser) {
                instance.classList.add("pr-approved")
            }

            if (approvedBySomeone && !rejectedBySomeone) {
                instance.classList.add("w3-pale-green")
                actionIgnore.classList.replace("w3-white", "w3-pale-green")
            } else if (rejectedBySomeone) {
                instance.classList.add("w3-pale-red")
                actionIgnore.classList.replace("w3-white", "w3-pale-red")
            }

            const matchingIcon = instance.querySelector(`div[data-matching=${matching}]`);
            if (matchingIcon !== null) {
                matchingIcon.classList.remove("w3-hide")
            }

            const priorityIcon = instance.querySelector(".pull-request-priority");
            if (pr.priority === "highest") {
                priorityIcon.classList.add("fa-solid", "fa-angles-up", "w3-text-red");
                priorityIcon.title = "Priority: HIGHEST";
                instance.dataset.priority = "4" + instance.dataset.created;
            } else if (pr.priority === "high") {
                priorityIcon.classList.add("fa-solid", "fa-angle-up", "w3-text-red");
                priorityIcon.title = "Priority: HIGH";
                instance.dataset.priority = "3" + instance.dataset.created;
            } else if (pr.priority === "low") {
                priorityIcon.classList.add("fa-solid", "fa-angle-down", "w3-text-blue");
                priorityIcon.title = "Priority: LOW";
                instance.dataset.priority = "2" + instance.dataset.created;
            } else if (pr.priority === "lowest") {
                priorityIcon.classList.add("fa-solid", "fa-angles-down", "w3-text-blue");
                priorityIcon.title = "Priority: LOWEST";
                instance.dataset.priority = "1" + instance.dataset.created;
            }

            // Remove the existing instance with the same ID
            const previous = document.getElementById("pull-request-" + pr.id);
            if (previous !== null) {
                previous.remove();
            }

            // Add the instance to the parent
            parent.appendChild(instance);
        }

        // Reapply Sorting
        this.applySorting();

        // Reapply Display options
        this.applyDisplayHideApproved()

        // Reapply filters
        this.applyFilters();

        // Remove all pull requests which were not been updated (probably merged or closed)
        const pulls = parent.querySelectorAll(".pull-request-instance");
        pulls.forEach(el => {
            const elLastCheck = new Date(parseInt(el.dataset.last_check));
            if (elLastCheck < lastCheck) {
                el.remove();
            }
        });
        checkNoPullRequest();

    });

window.document.addEventListener("gh_organizations",
    (e) => {
        const user = e.detail.user;
        const orgs = e.detail.orgs;

        const template = document.getElementById("filter-organization-template");
        const parent = document.getElementById("filter-organization-list");

        // Add a first item for ALL feature
        let instanceAll = document.getElementById("filter-organization-all");
        if (instanceAll === null) {
            instanceAll = template.cloneNode(true);
            instanceAll.id = "filter-organization-all";
            instanceAll.dataset.filter = "organization";
            instanceAll.dataset.filter_value = "all";
            instanceAll.classList.add("filter-organization-instance");
            instanceAll.classList.remove("w3-hide");
            instanceAll.addEventListener('click', onClickFilter);
            instanceAll.querySelector("img").classList.add("w3-hide");
            let txt = instanceAll.querySelector("span");
            txt.innerText = "ALL";
        }
        parent.prepend(instanceAll);

        // Add a first item for the user itself
        let instance = document.getElementById("filter-organization-" + user.login);
        if (instance === null) {
            instance = template.cloneNode(true);
            instance.id = "filter-organization-" + user.login;
            instance.dataset.filter = "organization";
            instance.dataset.filter_value = user.login;
            instance.classList.add("filter-organization-instance");
            instance.classList.remove("w3-hide");
            instance.addEventListener('click', onClickFilter);

            let img = instance.querySelector("img");
            img.src = user.avatarUrl;

            let txt = instance.querySelector("span");
            txt.innerText = "@" + user.login;
        }
        parent.prepend(instance);

        for (const org of orgs) {
            let instance = document.getElementById("filter-organization-" + org.login);
            if (instance === null) {
                instance = template.cloneNode(true);
                instance.id = "filter-organization-" + org.login;
                instance.dataset.filter = "organization";
                instance.dataset.filter_value = org.login;
                instance.classList.add("filter-organization-instance");
                instance.classList.remove("w3-hide");

                let img = instance.querySelector("img");
                img.src = org.avatarUrl;

                let txt = instance.querySelector("span");
                txt.innerText = "@" + org.login;

                instance.addEventListener('click', onClickFilter);
            }
            parent.prepend(instance);
        }

    });

window.document.addEventListener("gh_filter_toggle",
    (e) => {
        const type = e.detail.type;
        const value = e.detail.value;
        const active = e.detail.active;
        const el = document.querySelector("button[data-filter=" + type + "][data-filter_value=" + value + "]")
        if (el === null) {
            return;
        }
        if (active) {
            el.classList.remove("w3-disabled")
        } else {
            el.classList.add("w3-disabled")
        }
        applyFilters()

    }, false);

window.addEventListener('DOMContentLoaded',
    (event) => {
        this.init();
        this.loading_step();
    });