import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'Learn about how we use cookies and similar technologies on Udyaibase.',
};

export default function CookiePolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <h1 className="font-sora font-bold text-xl sm:text-2xl text-navy dark:text-white mb-6">
        Cookie Policy
      </h1>
      <div className="prose prose-sm dark:prose-invert prose-blue max-w-none">
        <p className="text-sm text-gray-500 mb-8"><strong>Last updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <p>
          Cookies are small text files that are placed on your device when you visit our website.
          They help us provide you with a better experience by remembering your preferences and
          understanding how you use our site.
        </p>

        <h2>1. How We Use Cookies</h2>
        <p>We use cookies for the following purposes:</p>

        <h3>Necessary Cookies</h3>
        <p>
          These cookies are essential for the website to function properly. They enable core
          functionality such as security, network management, and accessibility.
        </p>
        <ul>
          <li>Authentication and session management</li>
          <li>Security and fraud prevention</li>
          <li>Cookie consent preferences</li>
        </ul>

        <h3>Analytics Cookies</h3>
        <p>
          These cookies help us understand how visitors interact with our website by collecting
          and reporting information anonymously.
        </p>
        <ul>
          <li>Google Analytics (_ga, _gid, _gat)</li>
          <li>Page view tracking</li>
          <li>User behavior analysis</li>
          <li>Performance monitoring</li>
        </ul>

        <h3>Marketing Cookies</h3>
        <p>
          These cookies are used to track visitors across websites to display relevant and
          engaging advertisements.
        </p>
        <ul>
          <li>Advertising campaign tracking</li>
          <li>Retargeting and remarketing</li>
          <li>Social media integration</li>
        </ul>

        <h2>2. Third-Party Cookies</h2>
        <p>We use services from third-party providers that may set cookies on your device:</p>
        <ul>
          <li><strong>Google Analytics:</strong> Helps us analyze website traffic and user behavior</li>
          <li><strong>Social Media Platforms:</strong> Enable social sharing and integration features</li>
        </ul>

        <h2>3. Managing Your Cookie Preferences</h2>
        <p>
          You have the right to decide whether to accept or reject cookies. You can exercise your
          cookie preferences by:
        </p>
        <ul>
          <li>Using the cookie consent banner that appears when you first visit our site</li>
          <li>Clicking the &quot;Cookie Settings&quot; link in our website footer</li>
          <li>Adjusting your browser settings to block or delete cookies</li>
        </ul>
        <p>
          Please note that blocking certain cookies may impact your experience on our website and
          limit the functionality available to you.
        </p>

        <h2>4. Cookie Retention</h2>
        <p>Different cookies have different retention periods:</p>
        <ul>
          <li><strong>Session Cookies:</strong> Deleted when you close your browser</li>
          <li><strong>Persistent Cookies:</strong> Remain on your device for a set period (typically 1–24 months)</li>
        </ul>

        <h2>5. Your Rights</h2>
        <p>Under GDPR, CCPA, and DPDP regulations, you have the right to:</p>
        <ul>
          <li>Access the personal data we hold about you</li>
          <li>Request correction of inaccurate data</li>
          <li>Request deletion of your data</li>
          <li>Object to processing of your data</li>
          <li>Withdraw consent at any time</li>
          <li>Lodge a complaint with a supervisory authority</li>
        </ul>

        <h2>6. Updates to This Policy</h2>
        <p>
          We may update this Cookie Policy from time to time to reflect changes in our practices
          or for other operational, legal, or regulatory reasons. When we make significant changes,
          we will notify you and may ask you to re-consent to our use of cookies.
        </p>

        <h2>7. Contact Us</h2>
        <p>If you have any questions about our use of cookies, please contact us at:</p>
        <p><strong>Email:</strong> <a href="mailto:privacy@udyaibase.com">privacy@udyaibase.com</a><br /><strong>Address:</strong> Udyaibase Technologies Pvt Ltd, Vijayawada, Andhra Pradesh, India</p>
      </div>
    </div>
  );
}
