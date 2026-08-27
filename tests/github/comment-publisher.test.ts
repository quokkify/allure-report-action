/**
 * Tests for GitHub comment publisher - ported from Python test_comment_upsert_matches_marker_and_authenticated_owner
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { publishPrComment } from '../../src/github/comment-publisher.js';

// Mock the entire @octokit/rest module
vi.mock('@octokit/rest', () => {
  const mockPaginate = vi.fn();
  const mockGetAuthenticated = vi.fn();
  const mockUpdateComment = vi.fn();
  const mockCreateComment = vi.fn();
  const mockIssuesListComments = vi.fn();

  class MockOctokit {
    constructor() {
      this.paginate = mockPaginate;
      this.rest = {
        users: { getAuthenticated: mockGetAuthenticated },
        issues: {
          listComments: mockIssuesListComments,
          updateComment: mockUpdateComment,
          createComment: mockCreateComment,
        },
      };
    }
  }

  return {
    Octokit: MockOctokit,
    // Expose mocks for test access
    __mocks: {
      mockPaginate,
      mockGetAuthenticated,
      mockUpdateComment,
      mockCreateComment,
      mockIssuesListComments,
    },
  };
});

// Mock @actions/github context
vi.mock('@actions/github', () => ({
  context: { repo: { owner: 'caller', repo: 'consumer' } },
}));

describe('GitHub Comment Publisher', () => {
  const marker = '<!-- secure-allure -->';

  let mocks: {
    mockPaginate: any;
    mockGetAuthenticated: any;
    mockUpdateComment: any;
    mockCreateComment: any;
    mockIssuesListComments: any;
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Get mocks from the mocked module
    const mod = await import('@octokit/rest');
    mocks = mod.__mocks;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function runPublishComment({
    userLogin = 'report-owner',
    userStatus,
    authorLogin = 'github-actions[bot]',
    comments,
  }: {
    userLogin?: string;
    userStatus?: number;
    authorLogin?: string;
    comments: any[];
  }) {
    // Setup mocks for this test case
    mocks.mockPaginate.mockResolvedValue(comments);

    if (userStatus) {
      const error: any = new Error('not a user token');
      error.status = userStatus;
      mocks.mockGetAuthenticated.mockRejectedValue(error);
    } else {
      mocks.mockGetAuthenticated.mockResolvedValue({ data: { login: userLogin } });
    }

    mocks.mockUpdateComment.mockResolvedValue({});
    mocks.mockCreateComment.mockResolvedValue({});

    await publishPrComment({
      githubToken: 'test-token',
      prNumber: 42,
      commentMarker: marker,
      commentAuthorLogin: authorLogin,
      body: `new report\n${marker}`,
    });

    return {
      updated: mocks.mockUpdateComment.mock.calls[0]?.[0] ?? null,
      created: mocks.mockCreateComment.mock.calls[0]?.[0] ?? null,
      paginate: mocks.mockPaginate.mock.calls[0]?.[0] ?? null,
    };
  }

  it('PAT owner matches and updates correct comment', async () => {
    const calls = await runPublishComment({
      userLogin: 'report-owner',
      comments: [
        { id: 1, user: { login: 'attacker' }, body: marker },
        { id: 2, user: { login: 'report-owner' }, body: marker },
      ],
    });

    expect(calls.updated?.comment_id).toBe(2);
    expect(calls.created).toBeNull();
  });

  it('GITHUB_TOKEN owner matches and updates correct comment', async () => {
    const calls = await runPublishComment({
      userStatus: 403,
      comments: [
        { id: 3, user: { login: 'attacker' }, body: marker },
        { id: 4, user: { login: 'github-actions[bot]' }, body: marker },
      ],
    });

    expect(calls.updated?.comment_id).toBe(4);
    expect(calls.created).toBeNull();
  });

  it('explicit GitHub App owner matches and updates correct comment', async () => {
    const calls = await runPublishComment({
      userStatus: 403,
      authorLogin: 'report-app[bot]',
      comments: [
        { id: 5, user: { login: 'attacker' }, body: marker },
        { id: 6, user: { login: 'report-app[bot]' }, body: marker },
      ],
    });

    expect(calls.updated?.comment_id).toBe(6);
    expect(calls.created).toBeNull();
  });

  it('unowned marker creates new comment', async () => {
    const calls = await runPublishComment({
      userLogin: 'report-owner',
      comments: [{ id: 7, user: { login: 'attacker' }, body: marker }],
    });

    expect(calls.updated).toBeNull();
    expect(calls.created?.issue_number).toBe(42);
  });
});
