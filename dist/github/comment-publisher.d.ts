export interface CommentPublisherOptions {
    githubToken: string;
    prNumber: number;
    commentMarker: string;
    commentAuthorLogin: string;
    body: string;
}
/**
 * Publishes or updates a PR comment
 */
export declare function publishPrComment(options: CommentPublisherOptions): Promise<void>;
//# sourceMappingURL=comment-publisher.d.ts.map