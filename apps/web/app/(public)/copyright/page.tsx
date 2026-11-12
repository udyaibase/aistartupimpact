import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Copyright & Takedown Policy",
  description: "Learn how to report copyright infringement on Udyaibase and our process for handling takedown requests.",
};

export default function CopyrightPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <h1 className="font-sora font-bold text-xl sm:text-2xl text-navy dark:text-white mb-6">
        Copyright & Takedown Policy
      </h1>
      <div className="prose prose-sm dark:prose-invert prose-blue max-w-none">
        <p className="text-sm text-gray-500 mb-8"><strong>Last updated:</strong> July 2026</p>

        <p>
          Udyaibase respects intellectual property rights and expects users of our platform to do the same. This policy outlines how to report copyright infringement and our process for handling takedown requests in compliance with the Indian Information Technology Act, 2000 and the Copyright Act, 1957.
        </p>

        <h2>1. Reporting Copyright Infringement</h2>
        <p>If you believe content on Udyaibase infringes your copyright, you may submit a takedown request. Your notice must include:</p>
        <ol>
          <li>Your full legal name and contact information (email, phone, address)</li>
          <li>Identification of the copyrighted work you claim is infringed</li>
          <li>The specific URL(s) on our platform where the infringing content appears</li>
          <li>A statement that you have a good faith belief the use is not authorized</li>
          <li>A statement, under penalty of perjury, that the information is accurate and you are the copyright owner or authorized representative</li>
          <li>Your physical or electronic signature</li>
        </ol>

        <h2>2. How to Submit a Takedown Request</h2>
        <p>Send your complete notice to:</p>
        <ul>
          <li><strong>Email:</strong> <a href="mailto:legal@udyaibase.com">legal@udyaibase.com</a></li>
          <li><strong>Subject:</strong> Copyright Takedown Request — [Your Company Name]</li>
        </ul>
        <p>Alternatively, use the <strong>"Report"</strong> button on any startup, tool, or event page and select "Copyright concern."</p>

        <h2>3. Our Process</h2>
        <ol>
          <li><strong>Acknowledgment (24 hours):</strong> We acknowledge receipt of your notice within 1 business day.</li>
          <li><strong>Review (3–5 business days):</strong> Our team reviews the claim and the reported content.</li>
          <li><strong>Action:</strong> If the claim is valid, we will remove or disable access to the infringing content and notify the content owner.</li>
          <li><strong>Counter-Notice:</strong> The content owner may file a counter-notice if they believe the removal was in error.</li>
          <li><strong>Restoration:</strong> If a valid counter-notice is received and no legal action is filed within 14 days, the content may be restored.</li>
        </ol>

        <h2>4. Counter-Notice</h2>
        <p>If your content was removed and you believe it was done in error, you may submit a counter-notice including:</p>
        <ul>
          <li>Your full name and contact information</li>
          <li>Identification of the removed content and its former location</li>
          <li>A statement under penalty of perjury that removal was a mistake</li>
          <li>Consent to jurisdiction of Indian courts</li>
          <li>Your signature</li>
        </ul>

        <h2>5. Repeat Infringers</h2>
        <p>We reserve the right to terminate accounts of users who repeatedly infringe copyrights.</p>

        <h2>6. Good Faith</h2>
        <p>Filing a false takedown request may result in liability. Please ensure your claim is genuine before submitting.</p>

        <h2>7. Contact</h2>
        <p>For copyright-related inquiries: <a href="mailto:legal@udyaibase.com">legal@udyaibase.com</a></p>
      </div>
    </div>
  );
}
