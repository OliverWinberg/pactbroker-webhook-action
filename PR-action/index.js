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
        const consumerName = getInput("consumerName") || "unknown-consumer";
        const consumerBranch = getInput("consumerVersionBranch");
        const consumerVersion = getInput("consumerVersionNumber");
        const pactUrl = getInput("pactUrl");
        const providerName = getInput("providerName");
        const baseBranch = getInput("baseBranch") || "main";
        const githubActor = getInput("githubActor") || "unknown-actor";

        const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

        const safeName = consumerName.toLowerCase().replace(/[^a-z0-9]/g, "-");
        const branchName = `pact-failed/${safeName}-${Date.now()}`;

        // Get base branch SHA
        const ref = await githubRequest(`/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`, "GET", null, githubToken);
        const sha = ref.object.sha;

        // Create branch
        await githubRequest(`/repos/${owner}/${repo}/git/refs`, "POST", {
            ref: `refs/heads/${branchName}`,
            sha
        }, githubToken);

        log.info(`Created branch ${branchName}`);

        // Create a file on the branch so GitHub allows a PR
        const fileContent = Buffer.from(
            `Contract verification failed for ${consumerName} at ${new Date().toISOString()}\n`
        ).toString("base64");

        await githubRequest(`/repos/${owner}/${repo}/contents/pact-failures/${safeName}.txt`, "PUT", {
            message: `[Pact] Contract verification failed: ${consumerName}`,
            content: fileContent,
            branch: branchName
        }, githubToken);

        // Create PR
        const prBody = [
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
            `| Triggered by | @${githubActor} |`,
            ``,
            `Please investigate and resolve the contract mismatch before merging.`
        ].join("\n");

        const pr = await githubRequest(`/repos/${owner}/${repo}/pulls`, "POST", {
            title: `[Pact] Contract verification failed: ${consumerName}`,
            body: prBody,
            head: branchName,
            base: baseBranch
        }, githubToken);

        log.info(`PR created: ${pr.html_url}`);

    } catch (error) {
        log.setFailed(error?.message || "Unknown error");
    }
}

run();