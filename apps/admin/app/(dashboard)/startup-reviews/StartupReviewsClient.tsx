"use client";

import ReviewsTable, { type Review } from '@/components/reviews/ReviewsTable';
import { updateReviewStatusAction, deleteReviewAction, bulkUpdateReviewStatusAction, bulkDeleteReviewAction } from "./actions";

export default function StartupReviewsClient({ initialReviews, publicBase }: { initialReviews: Review[]; publicBase: string }) {
  return (
    <ReviewsTable
      kind="startup"
      publicBase={publicBase}
      initialReviews={initialReviews}
      actions={{ updateStatus: updateReviewStatusAction, remove: deleteReviewAction, bulkUpdateStatus: bulkUpdateReviewStatusAction, bulkRemove: bulkDeleteReviewAction }}
    />
  );
}
