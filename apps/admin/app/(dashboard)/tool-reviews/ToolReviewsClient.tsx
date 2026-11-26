"use client";

import ReviewsTable, { type Review } from '@/components/reviews/ReviewsTable';
import { updateReviewStatusAction, deleteReviewAction, bulkUpdateReviewStatusAction, bulkDeleteReviewAction } from "./actions";

export default function ToolReviewsClient({ initialReviews, publicBase }: { initialReviews: Review[]; publicBase: string }) {
  return (
    <ReviewsTable
      kind="tool"
      publicBase={publicBase}
      initialReviews={initialReviews}
      actions={{ updateStatus: updateReviewStatusAction, remove: deleteReviewAction, bulkUpdateStatus: bulkUpdateReviewStatusAction, bulkRemove: bulkDeleteReviewAction }}
    />
  );
}
