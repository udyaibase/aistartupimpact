import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Content Guidelines",
  description: "Community standards and content guidelines for startups, tools, events, and user-generated content on Udyaibase.",
};

export default function ContentGuidelinesPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <h1 className="font-sora font-bold text-xl sm:text-2xl text-navy dark:text-white mb-6">
        Content Guidelines
      </h1>
      <div className="prose prose-sm dark:prose-invert prose-blue max-w-none">
        <p className="text-sm text-gray-500 mb-8"><strong>Last updated:</strong> July 2026</p>

        <p>
          Udyaibase is a platform for the AI startup community — founders, builders, investors, and enthusiasts. These guidelines ensure our directory, events, and content remain trustworthy, accurate, and valuable for everyone.
        </p>

        <h2>1. Startup & Tool Listings</h2>
        <h3>What's Allowed</h3>
        <ul>
          <li>Active companies building AI/ML products or services</li>
          <li>Accurate company information (name, description, funding, team size)</li>
          <li>Official logos and screenshots with proper rights</li>
          <li>Factual descriptions of products and services</li>
          <li>Legitimate links to official websites and social profiles</li>
        </ul>
        <h3>What's Not Allowed</h3>
        <ul>
          <li>Fake or shell companies created solely for directory presence</li>
          <li>Misleading funding claims or fabricated metrics</li>
          <li>Impersonation of another company or individual</li>
          <li>Spam, affiliate links, or promotional content disguised as a listing</li>
          <li>Adult content, hate speech, or illegal services</li>
          <li>Duplicate listings for the same company</li>
        </ul>

        <h2>2. Events</h2>
        <h3>What's Allowed</h3>
        <ul>
          <li>Genuine AI/tech events (conferences, hackathons, meetups, workshops)</li>
          <li>Free and paid events with transparent pricing</li>
          <li>Accurate date, time, and location information</li>
          <li>Events organized by individuals, companies, or communities</li>
        </ul>
        <h3>What's Not Allowed</h3>
        <ul>
          <li>Fake events created to collect personal data</li>
          <li>Events with misleading descriptions or hidden costs</li>
          <li>Events promoting illegal activities</li>
          <li>Repeated creation of identical/similar events for spam purposes</li>
        </ul>

        <h2>3. Reviews & Comments</h2>
        <ul>
          <li>Reviews must be based on genuine experience with the product/service</li>
          <li>Constructive criticism is welcome; personal attacks are not</li>
          <li>Competitors may not post fake negative reviews</li>
          <li>Companies may not post fake positive reviews of themselves</li>
          <li>Reviews containing profanity, threats, or discrimination will be removed</li>
        </ul>

        <h2>4. User Profiles</h2>
        <ul>
          <li>Use your real identity (real name, real company)</li>
          <li>Do not impersonate others</li>
          <li>Profile information should be accurate and current</li>
          <li>One account per person (no duplicate accounts)</li>
        </ul>

        <h2>5. Intellectual Property</h2>
        <ul>
          <li>Only upload content you own or have rights to use</li>
          <li>Respect others' trademarks, copyrights, and patents</li>
          <li>See our <a href="/copyright">Copyright Policy</a> and <a href="/trademark">Trademark Policy</a> for dispute resolution</li>
        </ul>

        <h2>6. Enforcement</h2>
        <p>Violations of these guidelines may result in:</p>
        <ul>
          <li><strong>Warning:</strong> First-time minor violations receive a notice</li>
          <li><strong>Content removal:</strong> Violating content is removed without notice</li>
          <li><strong>Account suspension:</strong> Repeated violations lead to temporary suspension</li>
          <li><strong>Permanent ban:</strong> Severe or repeated violations result in permanent removal</li>
        </ul>

        <h2>7. Reporting Violations</h2>
        <p>
          If you encounter content that violates these guidelines, please use the <strong>"Report"</strong> button on any listing, event, or profile page. You can also email <a href="mailto:support@udyaibase.com">support@udyaibase.com</a>.
        </p>

        <h2>8. Appeals</h2>
        <p>
          If your content was removed or your account was suspended and you believe it was in error, you may appeal by emailing <a href="mailto:appeals@udyaibase.com">appeals@udyaibase.com</a> with your case details. Appeals are reviewed within 5 business days.
        </p>

        <h2>9. Changes</h2>
        <p>We may update these guidelines as the platform evolves. Continued use of Udyaibase implies acceptance of the current guidelines.</p>
      </div>
    </div>
  );
}
