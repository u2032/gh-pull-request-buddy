# GitHub Pull Request Buddy

This project is deployed at this URL: https://u2032.github.io/gh-pull-request-buddy/

## Context

It's sometimes difficult to know what is currently waiting on us for review.

In particular GitHub has a specific model in mind which doesn't fit with my needs: if someone put a review request for me on a pull request, directly or for one of the team I'm part of, the pull request is highlighted quite properly as waiting on me.

But as soon as I add a comment (or even someone else if the review request was for a team), the pull request is not highligthed anymore: GitHub considers that the review is done and doesn't need our attention anymore.

In my opinion, a Pull Request needs our attention until it's merged (or closed).

That's why I implemented by own dashboard for waiting pull requests on top of the GitHub API :) 

## The dashboard

The dashboard displays the pull requests that: 
* ... you can access
* ... are still opened
* ... require your attention :
  * you are the author
  * you are assigned to it
  * a review request has been made (directly or through one of your team)
  * you made a review on it

Here is how it looks: 
[insert screeshot]

The dashboard can be filtered by organization and by matching type (direct or team)

### Additional features

#### Ignore list (soon)
If you are really not interested in a pull request, you can ignore it, it will be hidden by the dashbord

#### Desktop notifications (soon)

You can enable some desktop notifications to be alerted on some events:
* when a new Pull Request has just been created and needs your attention
* when a Pull Request is opened for a long time

#### Gamification (soon)

Earn "Good Guy" points when you quickly review a pull request and help it be merged as soon as possible  

## Troubleshootings

### Missing pull requests

First, please note that the dahsboard fetch regurlarly the data, it's not real time, so it could take some minutes to detect the pull request

If a pull request should be displayed but doesn't appear on the dashboard, it could be because the GitHub token your provided has not enough rights, in particular the ones allowing the dashboard to access the organization. Please check is the token is properly allowed to do that.

Another thing that could happen : you could have reach the rate limit of the API. It could happen mainly if you made many manual refreshs during the last hour. In this case, please wait more time (max one hour) 

### Did you find a bug?

If you found an issue, please let us know by sharing what happens and we'll try to fix your specific case (someone else has probably the same issue than you!)

## Technical notes

### Security concerns

The GitHub token you provide is used by the dashboard but shared with nobody. All the implementation of the dashboard is client side and run inside your browser.

Moreover, no third-party script are loaded by the page (mainly to avoid the risk of a compromised library) and all implemented scripts by this project are protected by an integrity hash and a strict Content Security Policy. 
It means that the browser will not execute anything else than what is expected, decreasing the risk to have your GitHub token stolen by someone.   

#### Generating the integrety hashes

Here are the command used to generate the hashes:
```shell
echo "controls.js: $(cat docs/scripts/controls.js | openssl dgst -sha384 -binary | openssl base64 -A)";
echo "github.js: $(cat docs/scripts/github.js | openssl dgst -sha384 -binary | openssl base64 -A)";
```

### Architecture 

This project is mainly composed by 3 files :

#### index.html
This file contains the HTML code for the view

#### controls.js
This file handles the updates of the view and let the user interacts whith the page

#### github.js
This file implements the calls to the GitHub API and keeps also the needed data to display. 
Some events are emitted by this part when something happens, like when a pull request has been fetched through the API (such an event is caught to update the view)  
