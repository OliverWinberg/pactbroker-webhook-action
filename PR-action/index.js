function getInput(name) {
    return process.env[`INPUT_${name.toUpperCase()}`];
}

const log = {
    info: console.log,
    setFailed: (message) => {
        console.error(message);
        process.exit(1);
    }
};

async function githubRequest(path, method, body, token) {
    const response = await fetch(`https://api.github.com${path}`, {
        method,
        headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`GitHub API error ${response.status}: ${text}`);
    }

    return response.json();
}

async function run() {
    try {
        const githubToken = getInput("githubToken");
        const consumerName = getInput("consumerName");
        const consumerBranch = getInput("consumerVersionBranch");
        const consumerVersion = getInput("consumerVersionNumber");
        const pactUrl = getInput("pactUrl");
        const providerName = getInput("providerName");
        const baseBranch = getInput("baseBranch") || "main";

        const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

        // Get base branch SHA
        const ref = await githubRequest(`/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`, "GET", null, githubToken);
        const sha = ref.object.sha;

        // Create branch
        const branchName = `pact-failed/${consumerName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
        await githubRequest(`/repos/${owner}/${repo}/git/refs`, "POST", {
            ref: `refs/heads/${branchName}`,
            sha
        }, githubToken);

        log.info(`Created branch ${branchName}`);

        // Create PR
        const body = [
            `## Contract Verification Failed`,
            ``,
            `The contract published by **${consumerName}** could not be verified by **${providerName}**.`,
            ``,
            `| | |`,
            `|---|---|`,
            `| Consumer | ${consumerName} |`,
            `| Consumer branch | ${consumerBranch} |`,
            `| Consumer version | ${consumerVersion} |`,
            `| Pact URL | ${pactUrl} |`,
            ``,
            `Please investigate and resolve the contract mismatch before merging.`
        ].join("\n");

        const pr = await githubRequest(`/repos/${owner}/${repo}/pulls`, "POST", {
            title: `[Pact] Contract verification failed: ${consumerName}`,
            body,
            head: branchName,
            base: baseBranch
        }, githubToken);

        log.info(`PR created: ${pr.html_url}`);

    } catch (error) {
        log.setFailed(error?.message || "Unknown error");
    }
}

run();