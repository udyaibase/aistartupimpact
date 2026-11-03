export default function RefundPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
      <h1 className="font-sora font-extrabold text-3xl sm:text-5xl text-navy dark:text-white mb-8">
        Refund & Cancellation Policy
      </h1>
      <div className="prose prose-lg dark:prose-invert prose-blue max-w-none">
        <p className="text-sm text-gray-500 mb-8"><strong>Last updated:</strong> October 31, 2026</p>

        <p>
          Udyaibase provides various digital services, including premium tool listings, sponsored directory placements, job board postings, event tickets, and advertising slots. This Refund & Cancellation Policy outlines the financial terms governing purchases made on our platform.
        </p>

        <h2>1. Payment Processing</h2>
        <p>
          All payments on Udyaibase are processed securely through <strong>Razorpay</strong>, a PCI-DSS compliant payment gateway regulated by the Reserve Bank of India (RBI). We do not store your credit/debit card details on our servers. All payment data is handled directly by Razorpay in accordance with their security standards.
        </p>
        <ul>
          <li>All prices are in Indian Rupees (INR). Plan prices are shown <strong>before GST</strong>; 18% GST is added and shown separately at checkout.</li>
          <li>You receive a payment confirmation from Razorpay, and a GST tax invoice from us by email (see section 4.6).</li>
        </ul>

        <h2>2. Premium Tool Listings</h2>
        <p>
          Purchases for premium tool listing upgrades are considered final once the upgrade is activated. Since the upgraded listing is immediately live and visible, refunds are not available for active listings.
        </p>

        <h2>3. Sponsored Listings & Advertising</h2>
        <p>
          Purchases for native advertising, featured placement spots, and sponsored newsletter campaigns are subject to the following:
        </p>
        <ul>
          <li>If an advertising campaign has already commenced or the newsletter has been sent, the fees are non-refundable.</li>
          <li>If you request a cancellation <strong>at least 5 business days</strong> prior to the scheduled campaign launch, we will process a full refund minus payment gateway processing fees (2-3%).</li>
          <li>Cancellations requested less than 5 business days before the scheduled date will not be refunded, though we may allow rescheduling at our discretion.</li>
        </ul>

        <h2>4. Employer Plans (Growth, Pro, Scale) and Event Host Plans (Pro, Event Boost)</h2>

        <h3>4.1 How plans work</h3>
        <ul>
          <li>Employer plans and event host Pro are <strong>prepaid monthly (30 days) or yearly (365 days)</strong>. Plans <strong>do not renew automatically</strong>. Nothing is charged unless you choose to pay again.</li>
          <li>We email you 3 days before a plan ends. Renewing the same plan early adds the new period to your current end date, so you never lose days. Switching to a different plan or billing period starts the new period on the day you pay.</li>
          <li>An <strong>Event Boost</strong> is a one-time purchase for one event and lasts until that event ends.</li>
        </ul>

        <h3>4.2 Free trial and free Event Boost</h3>
        <ul>
          <li>A new employer workspace gets a <strong>7-day Pro trial</strong> when it publishes its first job. No card is needed and nothing is charged. When the trial ends, the workspace moves to the Free plan unless you choose a plan.</li>
          <li>An event host&apos;s <strong>first published event gets a free Event Boost</strong>.</li>
          <li>Trials and free Boosts are one per account and one per company or startup. As nothing is paid for them, they are not refundable or exchangeable for credit.</li>
        </ul>

        <h3>4.3 When a paid plan ends</h3>
        <ul>
          <li>You get <strong>3 grace days</strong> after a paid plan ends. Your featured jobs and events, limits, careers page and website widgets keep working; only new AI candidate reviews and new event promo emails pause. Renew during grace to carry on without any change.</li>
          <li>After grace, the account moves to the Free plan. <strong>Nothing is deleted.</strong> Candidates, notes and past AI reviews stay. If more jobs are open than the Free plan allows, the most recently published stay open and the rest are paused, which you can change at any time.</li>
          <li>Trials end on their end date, with no grace days.</li>
        </ul>

        <h3>4.4 Refunds for plans</h3>
        <ul>
          <li><strong>Charged by mistake or twice:</strong> full refund. Tell us within 7 days of the payment.</li>
          <li><strong>Paid but didn&apos;t use it:</strong> full refund if you ask within <strong>7 days of payment</strong> (<strong>14 days for a yearly plan</strong>) and haven&apos;t used a paid feature in that time. For employer plans, that means no AI candidate reviews run beyond the Free plan&apos;s monthly allowance, no jobs published or reopened beyond the Free plan limit, and no teammates invited beyond the Free plan&apos;s seats. For Pro, no promo email sent and no event published beyond the Free plan limit. Available once per account.</li>
          <li><strong>Cancelling during a plan:</strong> there are no partial or pro-rata refunds. The plan stays active until the end of the period you paid for.</li>
          <li><strong>When something went wrong on our side</strong> (for example, a job held by mistake during a moderation review, or the platform being unavailable for more than 24 hours): we add the lost days to your plan, or more, as a goodwill credit.</li>
          <li>No refunds are given because a role was filled early, an event sold out, or a listing received fewer applicants or registrations than hoped.</li>
          <li>If we suspend an account, close jobs or remove events for breaking our <a href="/terms">Terms</a> (for example fake or misleading jobs, or asking candidates for money), the remaining plan period or Boost is not refunded.</li>
        </ul>

        <h3>4.5 Event Boost refunds</h3>
        <ul>
          <li>A paid Event Boost can be refunded in full within 7 days of payment, as long as <strong>its promo email has not been sent</strong> and the event has not started.</li>
          <li>If you cancel the event before the promo email is sent, the Boost is refunded in full.</li>
        </ul>

        <h3>4.6 GST invoices and credit notes</h3>
        <ul>
          <li>Every paid plan and Boost gets a <strong>GST tax invoice</strong>, emailed to the invoice email (and any CC addresses) in your Billing details. You can also download it from <strong>Plans &amp; billing</strong>.</li>
          <li>Invoices are issued with the billing details saved at the time of payment. Keep them correct, including your GSTIN, as changes apply to future invoices only.</li>
          <li>Need a past invoice corrected (for example a wrong GSTIN)? Contact us within the same financial year. We issue a credit note and a corrected invoice.</li>
          <li>Every refund comes with a <strong>GST credit note</strong> against the original invoice, emailed to you and available on the billing page.</li>
        </ul>

        <h2>5. Event Tickets</h2>
        <p>
          Paid tickets are sold by the event host and paid through Razorpay. Udyaibase keeps a small platform fee per ticket; the rest is paid out to the host after the event.
        </p>
        <ul>
          <li>If the host cancels the event, every paid ticket is refunded in full automatically.</li>
          <li>Hosts can also refund an individual ticket in full; the refund goes back to the original payment method.</li>
          <li>Other refund requests follow the host&apos;s own policy, shown on the event page. Contact the host first; if they don&apos;t respond, email us.</li>
          <li>Refunds usually reach your bank within 5–7 working days.</li>
        </ul>

        <h2>6. Failed Transactions</h2>
        <p>
          In compliance with RBI guidelines, if a payment is debited from your account but the transaction fails or is not confirmed by our system:
        </p>
        <ul>
          <li>The amount will be automatically refunded to your original payment method within <strong>5 business days</strong>.</li>
          <li>If you do not receive the refund within 5 business days, please contact us with your Razorpay payment ID or order ID.</li>
          <li>Duplicate charges due to payment gateway errors will be refunded automatically or upon request within 48 hours.</li>
        </ul>

        <h2>7. Exceptional Circumstances</h2>
        <p>
          We may grant exceptions and issue refunds on a case-by-case basis:
        </p>
        <ul>
          <li><strong>Duplicate Charges:</strong> Accidental multiple charges due to a payment gateway error.</li>
          <li><strong>Service Unavailability:</strong> Extended platform downtime that significantly impairs the value of a time-bound purchase.</li>
          <li><strong>Unauthorized Transactions:</strong> If you believe a transaction was made without your authorization, report it within 48 hours.</li>
        </ul>

        <h2>8. Refund Process</h2>
        <p>
          Approved refunds are processed within <strong>5 to 7 business days</strong> and credited back to the original payment method (or by bank transfer for payments made by bank transfer or UPI outside Razorpay). Depending on your bank or card issuer, it may take a few more days to show in your account. Refunds are processed through Razorpay&apos;s refund system for full traceability, and plan and Boost refunds come with a GST credit note (section 4.6).
        </p>

        <h2>9. Contact for Billing</h2>
        <p>
          To initiate a cancellation, dispute a charge, or request a refund, please contact our billing team with your Razorpay payment ID or order ID:
        </p>
        <p>
          <strong>Email:</strong> billing@udyaibase.com<br />
          <strong>Response time:</strong> Within 48 hours on business days.
        </p>
      </div>
    </div>
  );
}
