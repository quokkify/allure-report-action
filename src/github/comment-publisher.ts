/**
 * GitHub comment publisher - handles PR comment creation/update
 */
import { Octokit } from '@octokit/rest';

export interface CommentPublisherOptions {
  githubToken: string;
  prNumber: number;
  commentMarker: string;
  commentAuthorLogin: string;
  body: string;
}

/**
 * Finds existing comment by marker and author
 */
async function findExistingComment(
  octokit: InstanceType<typeof Octokit>,
  owner: string,
  repo: string,
  issueNumber: number,
  marker: string,
  expectedAuthor: string
): Promise<{ id: number } | null> {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  return (
    comments.find(c => c.user?.login === expectedAuthor && (c.body || '').includes(marker)) ?? null
  );
}

/**
 * Resolves the expected author login, trying authenticated user first
 */
async function resolveExpectedAuthor(
  octokit: InstanceType<typeof Octokit>,
  configuredAuthor: string
): Promise<string> {
  let expectedAuthor = configuredAuthor.trim();
  try {
    const authenticated = await octokit.rest.users.getAuthenticated();
    if (authenticated.data?.login) {
      expectedAuthor = authenticated.data.login;
    }
  } catch (error) {
    // Ignore 403/404 - token may not support /user endpoint
    if (![403, 404].includes((error as { status?: number }).status ?? 0)) {
      throw error;
    }
  }

  if (!expectedAuthor) {
    throw new Error(
      'comment-author-login is required when github-token does not support GET /user'
    );
  }

  return expectedAuthor;
}

/**
 * Publishes or updates a PR comment
 */
export async function publishPrComment(options: CommentPublisherOptions): Promise<void> {
  const { githubToken, prNumber, commentMarker, commentAuthorLogin, body } = options;

  if (!prNumber) {
    console.log('No PR number; skip Allure PR comment.');
    return;
  }

  if (!commentMarker.trim()) {
    throw new Error('comment-marker must not be empty');
  }

  const octokit = new Octokit({ auth: githubToken });

  // Get repository info from context
  const { context } = await import('@actions/github');
  const { owner, repo } = context.repo;

  const expectedAuthor = await resolveExpectedAuthor(octokit, commentAuthorLogin);
  const existing = await findExistingComment(
    octokit,
    owner,
    repo,
    prNumber,
    commentMarker,
    expectedAuthor
  );

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    console.log(`Updated existing PR comment #${existing.id}`);
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
    console.log('Created new PR comment');
  }
}
