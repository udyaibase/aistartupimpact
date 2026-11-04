export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <h1 className="font-sora font-bold text-xl sm:text-2xl text-navy dark:text-white mb-6">
        Privacy Policy
      </h1>
      <div className="prose prose-sm dark:prose-invert prose-blue max-w-none">
        <p className="text-sm text-gray-500 mb-8"><strong>Last updated:</strong> August 10, 2026</p>

        <p>
          Welcome to Udyaibase. This Privacy Policy explains how <strong>Udyaibase</strong> (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) collects, uses, stores, and protects the personal data of users (&quot;you&quot;, &quot;your&quot;) when you use our website, newsletters, directories, event platform, job board, and related services (collectively, the &quot;Services&quot;).
        </p>
        <p>
          We are committed to protecting your personal data in accordance with the <strong>Digital Personal Data Protection Act, 2023 (DPDPA)</strong> and the rules made thereunder, to the extent they are in force at the relevant time. As the DPDPA framework is being implemented in phases, we will update this policy as additional provisions come into effect. This policy also reflects our voluntary adoption of privacy best practices.
        </p>

        <h2>1. Eligibility</h2>
        <p>
          Our Services are intended for persons aged <strong>18 years and above</strong>. We do not knowingly collect personal data from anyone under 18 years of age. This age restriction is our operational policy; we recognise that the DPDPA defines &quot;child&quot; as a person below 18 years and imposes specific obligations regarding children&apos;s data.
        </p>
        <p>
          If we become aware that we have collected data from a person under 18 without verifiable parental or guardian consent, we will delete such data promptly. If you are a parent or guardian and believe your child has provided personal data to us, please contact us at privacy@udyaibase.com.
        </p>

        <h2>2. Personal Data We Collect</h2>
        <p>We collect the following categories of personal data depending on how you interact with our Services:</p>

        <h3>2.1 Data You Provide Directly</h3>
        <ul>
          <li><strong>Account Registration:</strong> Name, email address, phone number, company name, job title, LinkedIn/Twitter profile URLs.</li>
          <li><strong>Startup/Tool Submissions:</strong> Startup name, description, website, funding details, founder information.</li>
          <li><strong>Event Registration:</strong> Name, email, phone, company, occupation, city.</li>
          <li><strong>Job Applications:</strong> Full name, email, resume link.</li>
          <li><strong>Newsletter Subscription:</strong> Email address, name (optional).</li>
          <li><strong>Contact Forms:</strong> Name, email, message content.</li>
          <li><strong>Payments:</strong> Payment is processed by Razorpay; we do not store credit/debit card numbers on our servers. We receive order ID, payment ID, and payment status from Razorpay.</li>
        </ul>

        <h3>2.2 Data Collected Automatically</h3>
        <ul>
          <li><strong>Usage Data:</strong> Pages visited, time spent, clicks, referrer URLs, browser type, device type, operating system.</li>
          <li><strong>IP Address:</strong> Collected for rate limiting, security, and analytics. For security logging, IP addresses are hashed before storage. For rate limiting, IP addresses are processed transiently and not stored in our database.</li>
          <li><strong>Cookies:</strong> We use cookies for essential site functionality, analytics (Google Analytics), and marketing preferences. See our <a href="/cookie-policy">Cookie Policy</a> for details.</li>
          <li><strong>Email Engagement:</strong> Open rates, click rates, and bounce status for emails sent through our platform.</li>
        </ul>

        <h2>3. How We Use Your Data and the Basis for Processing</h2>
        <p>Under the DPDPA, personal data may be processed based on <strong>consent</strong> or for certain <strong>legitimate uses</strong> specified in the Act. Below is how we process your data:</p>

        <h3>3.1 Processing Based on Your Consent</h3>
        <ul>
          <li><strong>Newsletter subscription:</strong> We send marketing newsletters after you provide your email address and subscribe. You may withdraw consent at any time by clicking the unsubscribe link in any email.</li>
          <li><strong>Account creation:</strong> When you create a founder, employer, or organiser account, you consent to us processing the data you provide for the purpose of operating your account.</li>
          <li><strong>Event registration:</strong> When you register for an event, you consent to us processing your registration data for that event.</li>
          <li><strong>Analytics cookies:</strong> Non-essential cookies are set only after you provide consent via our cookie consent banner.</li>
        </ul>

        <h3>3.2 Processing for Legitimate Uses</h3>
        <p>Certain processing activities do not require separate consent under the DPDPA because they fall within legitimate uses, including:</p>
        <ul>
          <li><strong>Transactional communications:</strong> Sending you emails necessary to operate the service you requested (e.g., account verification, password reset, order confirmation, event reminders).</li>
          <li><strong>Security and fraud prevention:</strong> Rate limiting, bot detection, webhook signature verification, and abuse prevention.</li>
          <li><strong>Compliance with law:</strong> Retaining data or disclosing information when required by applicable Indian law, regulation, or court order.</li>
        </ul>

        <h2>4. Data Sharing and Third-Party Service Providers</h2>
        <p>We do not sell your personal data. We share data with the following service providers who process data on our behalf to operate our Services:</p>
        <table>
          <thead>
            <tr><th>Service Provider</th><th>Purpose</th><th>Data Shared</th><th>Location</th></tr>
          </thead>
          <tbody>
            <tr><td>Vercel</td><td>Website hosting and deployment</td><td>Usage data, IP address</td><td>Singapore (primary), global edge</td></tr>
            <tr><td>Neon</td><td>PostgreSQL database hosting</td><td>All stored personal data</td><td>Singapore (AWS ap-southeast-1)</td></tr>
            <tr><td>Resend</td><td>Transactional and marketing email delivery</td><td>Email address, name</td><td>Tokyo</td></tr>
            <tr><td>Razorpay</td><td>Payment processing</td><td>Order details, payment amount</td><td>India</td></tr>
            <tr><td>Upstash</td><td>Rate limiting and caching</td><td>IP-derived identifiers</td><td>India (Mumbai)</td></tr>
            <tr><td>Google Analytics</td><td>Website analytics (with consent)</td><td>Usage data, anonymised IP</td><td>USA</td></tr>
            <tr><td>Sentry</td><td>Error monitoring</td><td>Error logs, device info</td><td>USA</td></tr>
            <tr><td>Cloudflare R2</td><td>Media and file storage</td><td>Uploaded images and files</td><td>Singapore</td></tr>
          </tbody>
        </table>

        <h3>4.1 Cross-Border Data Transfers</h3>
        <p>
          Some of our service providers are located outside India, including in Singapore and the United States. Your personal data may be transferred to and processed in these jurisdictions. We carry out such transfers in accordance with the provisions of the DPDPA and any restrictions or conditions notified by the Central Government regarding transfer of personal data outside India. Where required, we will obtain your consent before such transfers.
        </p>
        <p>
          We may also disclose personal data if required by Indian law enforcement, regulatory bodies, or court orders.
        </p>

        <h2>5. Data Retention</h2>
        <p>We retain personal data only as long as necessary for the purposes described in this policy, or as required by applicable law:</p>
        <ul>
          <li><strong>Account data:</strong> Retained until you delete your account.</li>
          <li><strong>Email logs:</strong> Retained for 90 days, then automatically purged.</li>
          <li><strong>Event registrations:</strong> Retained for 12 months after the event date.</li>
          <li><strong>Newsletter subscriber data:</strong> Retained until you unsubscribe. Unverified subscribers are automatically deleted after 7 days.</li>
          <li><strong>Unsubscribe records:</strong> Retained for 12 months for audit purposes.</li>
          <li><strong>Job applications:</strong> Retained for 12 months after submission.</li>
          <li><strong>Payment records:</strong> Retained as required by applicable Indian tax and accounting regulations.</li>
          <li><strong>Expired sessions:</strong> Automatically purged after 30 days.</li>
          <li><strong>Founder security and verification logs:</strong> Retained for 12 months, including after you delete your account, then automatically deleted. Only authorised staff can open them, to investigate a security issue, and each access is recorded.</li>
          <li><strong>Listing change history:</strong> Earlier versions of a listing and who changed them are retained for 12 months, then automatically deleted.</li>
          <li><strong>Company listings:</strong> When a founder deletes their account, listings they submitted are deleted. Listings that were already in our directory stay public as company information, without the founder linked to them.</li>
        </ul>

        <h2>6. Your Rights</h2>
        <p>Under the DPDPA 2023, to the extent the relevant provisions are in force, you have the following rights:</p>
        <ul>
          <li><strong>Right to Access:</strong> You may request a summary of the personal data we hold about you and how it is being processed.</li>
          <li><strong>Right to Correction:</strong> You may request correction of inaccurate or incomplete personal data. You can update most account information directly through your profile settings.</li>
          <li><strong>Right to Erasure:</strong> You may request deletion of your personal data. Founder users can delete their account from their account settings. For other data deletion requests, please contact privacy@udyaibase.com.</li>
          <li><strong>Right to Withdraw Consent:</strong> You may withdraw consent at any time by unsubscribing from emails, deleting your account, or contacting us. Withdrawal does not affect the lawfulness of processing carried out before withdrawal.</li>
          <li><strong>Right to Grievance Redressal:</strong> You may raise a grievance with our Grievance Officer (details below).</li>
          <li><strong>Right to Nominate:</strong> You may nominate another person to exercise your rights in the event of your death or incapacity, as provided under the DPDPA.</li>
        </ul>
        <p>
          To exercise any of these rights, contact us at <strong>privacy@udyaibase.com</strong>. We may need to verify your identity before processing your request.
        </p>

        <h2>7. Data Security</h2>
        <p>We implement reasonable security measures to protect your personal data, including:</p>
        <ul>
          <li>All data in transit is encrypted using TLS/SSL (HTTPS enforced).</li>
          <li>Database access is restricted and requires authenticated credentials.</li>
          <li>Passwords are hashed using bcrypt with salt rounds.</li>
          <li>Rate limiting is applied to authentication and submission endpoints.</li>
          <li>Content Security Policy and other security headers are configured.</li>
          <li>Webhook signatures are verified for payment and email events.</li>
          <li>Email sending is logged for audit trail purposes.</li>
        </ul>

        <h2>8. Cookies</h2>
        <p>
          We use a cookie consent banner that allows you to accept, reject, or customise your cookie preferences across three categories: Necessary (always active), Analytics, and Marketing. See our full <a href="/cookie-policy">Cookie Policy</a> for details.
        </p>

        <h2>9. Marketing Communications</h2>
        <p>
          We send marketing emails (newsletters, event promotions) only to users who have given consent by subscribing with their email address. Every marketing email includes a one-click unsubscribe link.
        </p>

        <h2>10. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time to reflect changes in our practices, our services, or applicable law. Material changes will be communicated via email to registered users where practicable. The &quot;Last updated&quot; date at the top reflects the most recent revision.
        </p>

        <h2>11. Grievance Officer</h2>
        <p>In accordance with the DPDPA 2023, we have appointed a Grievance Officer to address your concerns regarding the processing of your personal data:</p>
        <p>
          <strong>Name:</strong> Lahori Venkatesh<br />
          <strong>Designation:</strong> Grievance Officer<br />
          <strong>Email:</strong> privacy@udyaibase.com<br />
          <strong>Address:</strong> Udyaibase Technologies Pvt Ltd, Vijayawada, Andhra Pradesh, India
        </p>
        <p>
          We aim to acknowledge grievances within 48 hours and to resolve them within 30 days, subject to the complexity of the matter and applicable legal requirements.
        </p>
        <p>
          If you are not satisfied with the resolution, you may approach the <strong>Data Protection Board of India</strong> as constituted under the DPDPA 2023.
        </p>
      </div>
    </div>
  );
}
