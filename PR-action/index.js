const github = require("@actions/github");

function getInput(name) {
    return process.env[`INPUT_${name.toUpperCase()}`];
}

const core = {
    getInput,
    info: console.log,
    setFailed: (message) => {
        console.error(message);
        process.exit(1);
    }
};

async function run() {
    try {
        const githubToken = core.getInput("githubToken");
        const consumerName = core.getInput("consumerName");
        const consumerBranch = core.getInput("consumerVersionBranch");
        const consumerVersion = core.getInput("consumerVersionNumber");
        const pactUrl = core.getInput("pactUrl");
        const providerName = core.getInput("providerName");
        const baseBranch = core.getInput("baseBranch");

        const octokit = github.getOctokit(githubToken);
        const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

        const branchName = `pact-failed/${consumerName.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;

        // Get base branch SHA
        const { data: ref } = await octokit.rest.git.getRef({
            owner,
            repo,
            ref: `heads/${baseBranch}`
        });

        // Create a branch (PR requires a branch, even if no code changes)
        await octokit.rest.git.createRef({
            owner,
            repo,
            ref: `refs/heads/${branchName}`,
            sha: ref.object.sha
        });

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

        const { data: pr } = await octokit.rest.pulls.create({
            owner,
            repo,
            title: `[Pact] Contract verification failed: ${consumerName}`,
            body,
            head: branchName,
            base: baseBranch
        });

        core.info(`PR created: ${pr.html_url}`);

    } catch (error) {
        core.setFailed(error?.message || "Unknown error");
    }
}

run();