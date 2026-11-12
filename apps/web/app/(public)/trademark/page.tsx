import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trademark Policy",
  description: "Udyaibase's policy on trademark use, disputes, and how to report trademark infringement.",
};

export default function TrademarkPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <h1 className="font-sora font-bold text-xl sm:text-2xl text-navy dark:text-white mb-6">
        Trademark Policy
      </h1>
      <div className="prose prose-sm dark:prose-invert prose-blue max-w-none">
        <p className="text-sm text-gray-500 mb-8"><strong>Last updated:</strong> July 2026</p>

        <p>
          Udyaibase lists startups, AI tools, and events as part of our directory service. We respect trademark rights and have established this policy to address concerns related to trademark use on our platform.
        </p>

        <h2>1. How Trademarks Appear on Our Platform</h2>
        <p>Company names, logos, and product names listed on Udyaibase are used for identification and informational purposes. Listings may be:</p>
        <ul>
          <li>Submitted by the company itself (claimed profiles)</li>
          <li>Added by our editorial team from public sources (news, press releases, funding announcements)</li>
          <li>Contributed by community members</li>
        </ul>

        <h2>2. Reporting Trademark Concerns</h2>
        <p>If you believe a listing on Udyaibase misuses your trademark, you may report it. Your notice should include:</p>
        <ol>
          <li>Your full name, company, and relationship to the trademark owner</li>
          <li>The trademark registration number (if registered) and jurisdiction</li>
          <li>The specific URL(s) on our platform where the concern exists</li>
          <li>A description of how the trademark is being misused</li>
          <li>Contact information for follow-up</li>
        </ol>

        <h2>3. How to Report</h2>
        <ul>
          <li><strong>Email:</strong> <a href="mailto:legal@udyaibase.com">legal@udyaibase.com</a></li>
          <li><strong>Subject:</strong> Trademark Concern — [Your Company/Brand Name]</li>
          <li><strong>Alternative:</strong> Use the "Report" button on any listing page and select "Trademark concern"</li>
        </ul>

        <h2>4. Our Process</h2>
        <ol>
          <li><strong>Review (5 business days):</strong> We review the reported listing against your trademark claim.</li>
          <li><strong>Action:</strong> Depending on the outcome, we may:
            <ul>
              <li>Remove or modify the listing</li>
              <li>Add a disclaimer or clarification</li>
              <li>Transfer profile control to the trademark owner</li>
              <li>Dismiss the report if no infringement is found</li>
            </ul>
          </li>
          <li><strong>Notification:</strong> Both parties are notified of the outcome.</li>
        </ol>

        <h2>5. What We Consider</h2>
        <ul>
          <li>Whether the trademark is registered</li>
          <li>Whether the use is likely to cause confusion</li>
          <li>Whether the listing is factual and informational</li>
          <li>Whether the reporter has authority to act on behalf of the trademark owner</li>
        </ul>

        <h2>6. Nominal / Fair Use</h2>
        <p>
          Udyaibase uses company names and logos for the purpose of identification, commentary, and news reporting. Such use is generally considered nominative fair use. We do not claim ownership of any third-party trademarks displayed on our platform.
        </p>

        <h2>7. Contact</h2>
        <p>For trademark inquiries: <a href="mailto:legal@udyaibase.com">legal@udyaibase.com</a></p>
      </div>
    </div>
  );
}
