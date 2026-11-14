/**
 * English text of the policies centre: a faithful translation of the owner's
 * Arabic document (policies-content.tsx, «مركز السياسات», 2 Nov 2026), section
 * by section and clause by clause. It must say exactly what the Arabic says;
 * when the Arabic changes, change this with it. The Arabic text prevails
 * (Terms, clause 12).
 */

import { CookieSettingsButton } from '@/components/analytics/consent-banner'
import { Link } from '@/i18n/routing'

import {
  cookieButtonClass,
  PolicyBody,
  PolicyCta,
  PolicyHero,
  PolicySection,
  PolicyTable,
  type PolicyId,
} from './policies-shell'

const TITLES: Record<PolicyId, string> = {
  terms: 'Terms and Conditions',
  booking: 'Booking and Order Confirmation Policy',
  cancellation: 'Cancellation and Refund Policy',
  digital: 'Itineraries and Digital Products Policy',
  payment: 'Payment and Pricing Policy',
  fulfillment: 'Service Fulfilment and Delivery Policy',
  privacy: 'Privacy and Data Protection Policy',
  cookies: 'Cookie Policy',
  safety: 'Safety Policy and Activity Participation Conditions',
  complaints: 'Complaints and Customer Service Policy',
}

const TOP = 'Back to top'

export function PoliciesContentEn() {
  return (
    <>
      <PolicyHero
        eyebrow="Platform policies and terms of use"
        title="Policies Centre"
        lede="Everything you need to know before and after you buy or book is gathered here: what you are buying, when your booking becomes confirmed, when you are entitled to cancel and be refunded, and how we handle your data. The conditions specific to each activity are always shown on its page before payment."
        updated="Last updated: 2 November 2026"
      />
      <PolicyBody tocTitle="Contents" titles={TITLES}>
        <PolicySection id="terms" title={TITLES.terms} backToTop={TOP}>
          <p>
            Welcome to <strong>Bali Trips</strong> (&quot;the platform&quot; or &quot;we&quot;).
            These terms govern your use of the website and of all the services available through it.
            By using the platform or completing any order or booking, you acknowledge that you have
            read, understood and accepted these terms, together with the related policies published
            in the Policies Centre.
          </p>
          <h3>1. Services offered by the platform</h3>
          <p>The platform offers the following services for the island of Bali:</p>
          <ul>
            <li>
              <strong>Digital itineraries:</strong> ready-made travel programmes that are purchased
              and downloaded electronically.
            </li>
            <li>
              <strong>The interactive tourist map:</strong> a map showing places and recommendations
              selected by the Bali Trips team; part of it is free and part of it requires a
              purchase.
            </li>
            <li>
              <strong>Booking of events, activities and tourist services:</strong> such as tours,
              water activities, adventures and the driver service, most of which are carried out by
              local service providers in Bali.
            </li>
          </ul>
          <h3>2. Eligibility</h3>
          <ul>
            <li>You must be 18 years of age or older to complete any purchase or booking.</li>
            <li>
              When booking for other people, you acknowledge that you are authorised to provide
              their details and to accept these terms on their behalf, and you are responsible for
              informing them of the activity&apos;s conditions.
            </li>
          </ul>
          <h3>3. Account and guest checkout</h3>
          <ul>
            <li>
              You can purchase by creating an account or as a guest, as the checkout page allows.
            </li>
            <li>
              You are responsible for keeping your account login details confidential and for
              everything done through your account.
            </li>
            <li>
              You can ask for your account to be closed at any time through the contact channels
              shown on the website.
            </li>
          </ul>
          <h3>4. Accuracy of information</h3>
          <p>
            You are responsible for the accuracy and completeness of the information you provide
            when booking, including the name, phone or WhatsApp number, number of participants, ages
            and place of stay in Bali. The platform bears no responsibility for a service that could
            not be carried out, or for being unable to reach you, because of wrong or incomplete
            information you provided, and no refund results from that.
          </p>
          <h3>5. Conclusion of the order</h3>
          <ul>
            <li>
              An order is considered received when payment is completed or proof of transfer is
              uploaded, and is considered confirmed as set out in the{' '}
              <strong>Booking and Order Confirmation Policy</strong>.
            </li>
            <li>
              All the essential information about the service is shown before payment: the
              description, the total price, the date, the cancellation conditions and the type of
              confirmation.
            </li>
            <li>You receive the order summary and its invoice by email and/or WhatsApp.</li>
          </ul>
          <h3>6. Relationship with service providers</h3>
          <ul>
            <li>
              Bali Trips operates as a platform that presents tourist activities and services and
              organises their booking, while most activities are carried out by independent local
              service providers (operating companies, guides, drivers and others).
            </li>
            <li>
              The platform is responsible for: presenting the information, receiving the booking and
              the payment, coordinating with the service provider, sending the confirmation, and
              following up your order and your complaint until it is closed.
            </li>
            <li>
              The service provider is responsible for: actually carrying out the activity, providing
              the equipment and qualified staff, applying safety standards, and complying with local
              regulations in Indonesia.
            </li>
            <li>
              The service provider&apos;s name may appear on the activity page or in the
              confirmation, depending on the nature of the booking. Some of the activity&apos;s
              conditions (such as age and safety) are issued by the service provider and are shown
              to you before payment.
            </li>
          </ul>
          <h3>7. The map and recommendations</h3>
          <p>
            The map and the recommendations are a planning aid. A place appearing on the map or in
            an itinerary does not guarantee its availability, the quality of its service, or that
            its prices and opening hours stay the same. Details are in the{' '}
            <strong>Itineraries and Digital Products Policy</strong>.
          </p>
          <h3>8. Prohibited uses</h3>
          <p>You must not:</p>
          <ul>
            <li>
              Copy, republish or sell the platform&apos;s content, the itineraries or the map data.
            </li>
            <li>Use automated tools to extract data from the website.</li>
            <li>Attempt unauthorised access to the systems or to users&apos; accounts.</li>
            <li>
              Provide false information, make fake bookings, or use a payment method you are not
              authorised to use.
            </li>
            <li>Use the platform for any purpose that violates the law.</li>
          </ul>
          <p>
            We have the right to suspend any account or cancel any order that is shown to be linked
            to a breach of these terms.
          </p>
          <h3>9. Intellectual property</h3>
          <p>
            All content of the platform is owned by or licensed to Bali Trips and is protected under
            intellectual property laws, including: the name and trademark, the design, the texts,
            the itineraries, the photos owned by the platform, the specially designed map, and the
            categories and collections. Using the platform or buying from it does not give you any
            ownership right, only a limited personal licence to use, in accordance with the{' '}
            <strong>Itineraries and Digital Products Policy</strong>.
          </p>
          <h3>10. Limits of liability</h3>
          <ul>
            <li>
              The platform takes due care in choosing service providers and verifying their
              information, but it is not liable for damage resulting directly from the service
              provider&apos;s conduct during the activity, from a participant not following the
              safety instructions, or from circumstances beyond control.
            </li>
            <li>
              The platform is not liable for indirect losses, such as a missed flight or a related
              hotel booking, unless that results from a direct fault of the platform.
            </li>
            <li>
              In all cases, the platform&apos;s liability does not exceed the value of the paid
              service that is the subject of the claim, within the limits permitted by law.
            </li>
            <li>
              We strongly advise you to take out <strong>travel insurance</strong> that covers the
              activities you intend to take part in.
            </li>
          </ul>
          <h3>11. Changes to the terms</h3>
          <p>
            We may update these terms from time to time, and the new date is published at the top of
            the page. The version in force at the time you complete your order applies to that
            order.
          </p>
          <h3>12. Governing language</h3>
          <p>
            These terms are published in Arabic and English. If there is any conflict between the
            two, the Arabic text prevails.
          </p>
          <h3>13. Governing law</h3>
          <p>
            These terms are governed by and interpreted in accordance with the laws of the Kingdom
            of Saudi Arabia.
          </p>
        </PolicySection>

        <PolicySection id="booking" title={TITLES.booking} backToTop={TOP}>
          <p>
            This policy explains how your order moves from a paid booking to a confirmed activity,
            and the important difference between <strong>completing payment</strong> and{' '}
            <strong>confirmation of availability</strong>.
          </p>
          <h3>1. Type of confirmation</h3>
          <p>Each activity carries one of two types of confirmation on its page:</p>
          <ul>
            <li>
              <strong>Instant Confirmation:</strong> the booking becomes confirmed immediately after
              payment succeeds.
            </li>
            <li>
              <strong>Subject to Availability:</strong> the booking is sent to the service provider
              to check availability, and you receive the confirmation or an apology within 24 hours
              at most from receipt of the order.
            </li>
          </ul>
          <h3>2. Order statuses</h3>
          <PolicyTable
            head={['Status', 'Meaning']}
            rows={[
              [
                <strong key="s">Awaiting payment / transfer</strong>,
                'The order has been created and payment is not yet complete, or the bank transfer has not been verified.',
              ],
              [
                <strong key="s">Under review</strong>,
                'Payment is complete and the booking is awaiting confirmation from the service provider.',
              ],
              [
                <strong key="s">Confirmed</strong>,
                'Availability has been confirmed and the booking voucher has been sent to you.',
              ],
              [<strong key="s">Completed</strong>, 'The activity has been carried out.'],
              [
                <strong key="s">Cancelled</strong>,
                'The booking was cancelled by you, by the platform or by the service provider.',
              ],
              [
                <strong key="s">Refunded</strong>,
                'The amount has been returned in the cases that qualify under the Cancellation and Refund Policy.',
              ],
            ]}
          />
          <p>
            <strong>Important:</strong> a booking with the status &quot;Under review&quot; is not
            yet a confirmed booking. We advise you not to tie other non-cancellable arrangements to
            it before the confirmation arrives.
          </p>
          <h3>3. If the activity is not available</h3>
          <p>
            If the service provider declines or the activity is full, we offer you one of the
            following options:
          </p>
          <ol>
            <li>An alternative date for the same activity.</li>
            <li>A similar alternative activity.</li>
            <li>A full refund of the amount paid.</li>
          </ol>
          <h3>4. Booking voucher</h3>
          <p>
            After confirmation you receive a voucher by email and/or WhatsApp, and it appears on the
            &quot;My Trip&quot; page. The voucher includes: the booking number, the activity and
            package, the date and time, the number of participants, the meeting point or pick-up
            address, the contact number for the day of the activity, and any special instructions.
            You must show the voucher (electronic or printed) when you arrive.
          </p>
          <h3>5. Meeting time and place</h3>
          <ul>
            <li>
              You must arrive at the meeting point, or be at the pick-up location, at least 15
              minutes before the scheduled time.
            </li>
            <li>
              If the activity includes hotel pick-up, you are responsible for entering the correct
              address of your stay and for being in the hotel lobby at the scheduled time.
            </li>
            <li>
              Arriving late may mean you cannot take part, and is treated as a no-show without
              refund.
            </li>
          </ul>
          <h3>6. Changing a booking</h3>
          <ul>
            <li>
              <strong>Increasing the number of people:</strong> possible subject to availability,
              with payment of the difference.
            </li>
            <li>
              <strong>Reducing the number of people:</strong> does not result in a refund after the
              cancellation deadline has passed.
            </li>
            <li>
              <strong>Changing the date or time:</strong> the request is submitted through the
              &quot;My Trip&quot; page or the contact channels, and is subject to the availability
              of the new time and the service provider&apos;s approval; it may involve a price
              difference or a fee set by the service provider. If the change is not possible, the
              booking stays on its original date.
            </li>
            <li>A change takes effect only once it has been confirmed to you in writing.</li>
          </ul>
          <h3>7. Booking for a group</h3>
          <p>
            The person who completes the booking is considered the representative of all
            participants, and undertakes to inform them of the confirmation, the instructions and
            the safety conditions.
          </p>
        </PolicySection>

        <PolicySection id="cancellation" title={TITLES.cancellation} backToTop={TOP}>
          <p>
            Bali Trips commits to booking the activities and paying the service providers in Bali as
            soon as your order is confirmed, and that amount cannot be recovered from them
            afterwards. Please therefore review the activity details, the date and the number of
            people carefully before completing payment.
          </p>
          <h3>1. General rule</h3>
          <p>
            All bookings are <strong>non-cancellable and non-refundable</strong> after the
            cancellation deadline set out below has passed.
          </p>
          <h3>2. Free cancellation deadline</h3>
          <p>
            You can cancel the booking and receive a full refund if you submit the cancellation
            request <strong>at least one hour before the activity&apos;s start time</strong>, unless
            the activity page states a different deadline for it. The cancellation request is
            submitted through the &quot;My Trip&quot; page or the official contact channels, and its
            time is counted from the moment we receive it.
          </p>
          <p>
            After this deadline the booking becomes final, and the amount is not refunded in any of
            the following cases:
          </p>
          <ul>
            <li>Cancellation by the customer for any reason.</li>
            <li>No-show, or arriving late for the meeting or pick-up time.</li>
            <li>Reducing the number of participants.</li>
            <li>
              A participant not meeting the safety or participation conditions announced in advance
              (such as age, weight or health condition).
            </li>
            <li>
              Personal circumstances, such as illness, a change of flight times or a change of
              travel plans.
            </li>
            <li>Not using part of the service after it has started.</li>
          </ul>
          <p>
            We therefore advise you to take out travel insurance that covers cancellation of
            activities.
          </p>
          <h3>3. Cancellation by the service provider or the platform</h3>
          <p>
            If the activity is cancelled by the service provider or the platform for a reason not
            attributable to you, you are entitled to choose between:
          </p>
          <ol>
            <li>
              <strong>An alternative date</strong> for the same activity at no extra charge.
            </li>
            <li>
              <strong>A similar alternative activity</strong>.
            </li>
            <li>
              <strong>A full refund</strong> of the amount paid for the activity.
            </li>
          </ol>
          <h3>4. Weather, safety and force majeure</h3>
          <ul>
            <li>
              The service provider has the right to stop or postpone the activity if weather or sea
              conditions, or any operating conditions, make it unsafe to carry out, and its decision
              on that is final, to protect your safety.
            </li>
            <li>
              <strong>Force majeure</strong> covers every circumstance beyond the control of the
              parties that prevents the activity from being carried out safely, including: dangerous
              weather, natural disasters, volcanic activity and earthquakes, closures or government
              decisions, epidemics, stoppage of public transport, unrest and major incidents.
            </li>
            <li>
              If the activity is cancelled for one of these reasons{' '}
              <strong>before it starts</strong>, we offer you an alternative date or an alternative
              activity, and if that is not possible the amount is refunded to you.
            </li>
            <li>
              If the activity is stopped <strong>after it has started</strong> for safety reasons,
              the amount is not refunded.
            </li>
          </ul>
          <h3>5. Digital products</h3>
          <p>
            Itineraries and access to the full map are non-refundable once delivered, in accordance
            with the <strong>Itineraries and Digital Products Policy</strong>.
          </p>
          <h3>6. Cases in which the amount is refunded</h3>
          <p>In addition to the above, the amount is refunded only in the following cases:</p>
          <ul>
            <li>
              <strong>Duplicate payment by mistake:</strong> the duplicate amount is refunded in
              full after it is verified.
            </li>
            <li>
              <strong>Amount charged without a booking being created:</strong> the amount is
              refunded in full, or the booking is confirmed.
            </li>
            <li>
              <strong>
                Service could not be carried out for a reason attributable to the platform:
              </strong>{' '}
              the amount is refunded in full.
            </li>
          </ul>
          <h3>7. Refund method and time</h3>
          <ul>
            <li>
              The amount is returned to the original payment method whenever that is possible; for a
              bank transfer it is returned to the account it was transferred from.
            </li>
            <li>
              We start the refund procedure within 5 working days of its approval, and it may take 5
              to 14 working days for the amount to appear in your account, depending on the bank or
              card issuer.
            </li>
            <li>Bank transfer fees charged by banks are not controlled by the platform.</li>
          </ul>
          <h3>8. Statutory rights</h3>
          <p>This policy does not affect any rights the law grants to the consumer.</p>
        </PolicySection>

        <PolicySection id="digital" title={TITLES.digital} backToTop={TOP}>
          <p>
            This policy governs the purchase and use of digital products at Bali Trips:{' '}
            <strong>ready-made itineraries</strong> and{' '}
            <strong>access to the full interactive map</strong>.
          </p>
          <h3>1. What does an itinerary contain?</h3>
          <p>
            Each itinerary is a travel programme for a set number of days and includes, depending on
            the itinerary: a suggested daily plan, recommended places and activities, restaurant and
            café suggestions, location links on the map, and practical tips on getting around and
            timing. The content of each itinerary, its number of days and the areas it covers are
            shown on its page before purchase.
          </p>
          <h3>2. Receiving it</h3>
          <ul>
            <li>
              The itinerary is available for download <strong>as soon as payment succeeds</strong>;
              the download link is sent to your email and/or WhatsApp and stays available on the
              &quot;My Trip&quot; page for those who have an account.
            </li>
            <li>
              If you pay by bank transfer, the itinerary is made available after the transfer is
              verified.
            </li>
            <li>
              You can ask for the file to be sent again at any time through the contact channels.
            </li>
          </ul>
          <h3>3. Download problems</h3>
          <p>
            If the file does not reach you, is damaged, or does not match the itinerary you bought,
            contact us and we will send the correct version. If the problem cannot be solved, we
            refund the amount in full.
          </p>
          <h3>4. Access to the full map</h3>
          <ul>
            <li>
              Part of the map is available free of charge; the remaining areas require purchasing
              full access.
            </li>
            <li>
              Access is linked to your account or to the order number, and lasts for the period
              shown at purchase.
            </li>
            <li>
              Access is personal, and login details may not be shared with others. We have the right
              to restrict access when unusual use is detected.
            </li>
          </ul>
          <h3>5. Refunds</h3>
          <ul>
            <li>
              Digital products are delivered immediately and cannot be returned, so{' '}
              <strong>
                the price of an itinerary is not refunded after it is downloaded or opened, nor the
                price of the map after full access is activated
              </strong>
              .
            </li>
            <li>
              The amount is refunded only if the product did not reach you and we were unable to
              deliver it, or if the amount was charged more than once.
            </li>
          </ul>
          <h3>6. Personal use and intellectual property</h3>
          <ul>
            <li>
              On purchase you are granted a personal, non-exclusive, non-transferable licence to use
              the itinerary or the map for your trip and that of your companions.
            </li>
            <li>
              Reselling the itinerary, publishing it, sharing it publicly or uploading it to any
              website or group is prohibited, as is copying the map data or systematically
              photographing it for the purpose of republishing.
            </li>
            <li>We have the right to take legal action when this is breached.</li>
          </ul>
          <h3>7. Accuracy of information and recommendations</h3>
          <ul>
            <li>
              The itineraries and the map represent the information and recommendations available{' '}
              <strong>at the time they were prepared or last updated</strong>.
            </li>
            <li>
              The opening hours, prices and addresses of places may change, and some may close;
              transport costs and event dates may also change.
            </li>
            <li>
              A place appearing on the map or in an itinerary means it is a recommendation from our
              team; it does not guarantee its availability or the quality of its service. Please
              check important information (such as reservations and opening hours) before you go.
            </li>
            <li>
              You can tell us about any inaccurate information, and we will review and update it.
            </li>
          </ul>
          <h3>8. Geographic location</h3>
          <p>
            When you use the &quot;Places near me&quot; feature, the map asks for your permission to
            access your location. We do not access your location without your consent, and you can
            withdraw it at any time from the browser or device settings. Details are in the{' '}
            <strong>Privacy Policy</strong>.
          </p>
        </PolicySection>

        <PolicySection id="payment" title={TITLES.payment} backToTop={TOP}>
          <h3>1. Currency</h3>
          <p>
            <strong>
              Payment is in Saudi riyals, and the price is shown approximately in your
              country&apos;s currency.
            </strong>{' '}
            The amount is always charged to your card in Saudi riyals (SAR), and the exact amount in
            riyals is shown to you before you confirm payment. The price shown in your
            country&apos;s currency is approximate and for guidance only. If you pay with a card
            issued in another currency, your card&apos;s issuing bank may apply a currency
            difference or international fees that the platform has nothing to do with.
          </p>
          <h3>2. Total price</h3>
          <p>
            Before payment, the order summary shows the total price in detail: the base price of the
            activity or package, the selected add-ons (such as the driver or additional services),
            discounts, and taxes or fees if any. No fee is added that was not shown to you before
            you confirmed payment.
          </p>
          <h3>3. What the price does not include</h3>
          <p>
            Unless expressly stated on the activity page under &quot;What the price includes&quot;,
            the price does not include: entrance fees to sites, meals, tips, personal expenses and
            insurance.
          </p>
          <h3>4. Payment methods</h3>
          <ul>
            <li>
              <strong>Electronic payment</strong> through a licensed payment gateway, using the
              payment methods available on the checkout page.
            </li>
            <li>
              <strong>Bank transfer</strong> to the platform&apos;s account shown on the checkout
              page.
            </li>
          </ul>
          <p>
            We do not keep your card details on our servers; they are processed entirely through the
            payment gateway in accordance with payment security standards.
          </p>
          <h3>5. Payment by bank transfer</h3>
          <ul>
            <li>
              The transfer must be completed and the receipt uploaded within 24 hours of the order
              being created.
            </li>
            <li>
              The order stays in the status &quot;Awaiting transfer&quot; until it is verified, and
              the seat or time slot is not definitively reserved before that.
            </li>
            <li>
              If the transfer does not arrive within the deadline, the order may be cancelled
              automatically. If the transfer arrives after cancellation, we rebook the service if it
              is available or refund the amount.
            </li>
            <li>
              The amount transferred must match the order total, and the customer bears any transfer
              fees charged by their bank.
            </li>
          </ul>
          <h3>6. Discounts and discount codes</h3>
          <ul>
            <li>
              Each discount code has its own conditions (period, minimum order, and the activities
              covered), and more than one code may not be combined unless stated otherwise.
            </li>
            <li>
              A code cannot be exchanged for cash, and is not applied retroactively to earlier
              orders.
            </li>
          </ul>
          <h3>7. Price changes</h3>
          <p>
            The prices of activities and itineraries may change at any time, but the price confirmed
            at payment does not change for your order. If a clearly wrong price appears because of a
            technical error, we inform you and offer you the choice of completing the order at the
            correct price or cancelling it and receiving a refund.
          </p>
          <h3>8. Payment problems</h3>
          <ul>
            <li>
              <strong>Payment failed:</strong> no booking is created, and any pending amount is
              returned automatically by the bank within its usual period.
            </li>
            <li>
              <strong>The amount was charged and the booking did not appear:</strong> contact us
              with the transaction number or a picture of the charge notification, and we will check
              and either confirm the booking or refund the amount.
            </li>
            <li>
              <strong>Duplicate payment:</strong> the duplicate amount is refunded in full after
              verification.
            </li>
          </ul>
          <h3>9. Invoice</h3>
          <p>
            You receive an electronic invoice for the order by email, and it is available on the
            &quot;My Trip&quot; page.
          </p>
          <h3>10. Refunds</h3>
          <p>
            Refunds are made only in the cases that qualify, in accordance with the{' '}
            <strong>Cancellation and Refund Policy</strong>.
          </p>
        </PolicySection>

        <PolicySection id="fulfillment" title={TITLES.fulfillment} backToTop={TOP}>
          <p>
            Bali Trips does not ship physical products, so this policy explains how and when digital
            services are delivered and activities are carried out.
          </p>
          <h3>1. Digital itineraries</h3>
          <ul>
            <li>
              Delivered as soon as payment succeeds, through a download link sent by email and/or
              WhatsApp, which stays available on the &quot;My Trip&quot; page.
            </li>
            <li>For a bank transfer, they are delivered after the transfer is verified.</li>
          </ul>
          <h3>2. Access to the full map</h3>
          <p>Activated as soon as payment succeeds, on the account or the order number.</p>
          <h3>3. Events and activities</h3>
          <ul>
            <li>
              <strong>Confirmation:</strong> instant or within 24 hours, depending on the
              activity&apos;s confirmation type, as set out in the{' '}
              <strong>Booking and Order Confirmation Policy</strong>.
            </li>
            <li>
              <strong>Voucher:</strong> sent after confirmation, and includes all the attendance
              details.
            </li>
            <li>
              <strong>Before the activity:</strong> the service provider or our team may contact you
              by WhatsApp before the date to confirm the pick-up or meeting time.
            </li>
            <li>
              <strong>Carrying out:</strong> done by the service provider on the date and at the
              time stated in the voucher, in accordance with the activity&apos;s description and
              what it includes.
            </li>
          </ul>
          <h3>4. Driver service</h3>
          <ul>
            <li>
              The suitable car is determined automatically according to the number of travellers,
              and the number of service hours and its range are stated in the order.
            </li>
            <li>
              The service starts from the pick-up location stated in the booking; any additional
              hours or areas outside the range may be charged additional fees agreed in advance.
            </li>
            <li>
              Entrance fees to sites, meals and parking are not included unless stated otherwise.
            </li>
          </ul>
          <h3>5. Delay in carrying out the service</h3>
          <p>
            If the service is delayed beyond its agreed time for a reason attributable to the
            platform or the service provider, we inform you immediately and offer you an alternative
            date or a refund.
          </p>
          <h3>6. Customer&apos;s responsibility</h3>
          <p>
            The customer undertakes to provide correct contact details, to reply to confirmation
            messages, to be present at the stated time and place, and to follow the service
            provider&apos;s instructions.
          </p>
        </PolicySection>

        <PolicySection id="privacy" title={TITLES.privacy} backToTop={TOP}>
          <p>
            At Bali Trips we are committed to protecting your personal data and processing it in
            accordance with the Personal Data Protection Law, its regulations and best practice.
            This policy explains the data we collect, its purpose, how it is used and shared, and
            your rights.
          </p>
          <h3>1. Data we collect</h3>
          <ul>
            <li>
              <strong>Identity and contact data:</strong> name, phone or WhatsApp number, and email
              address.
            </li>
            <li>
              <strong>Booking data:</strong> the activities booked, the dates, the number of
              travellers, the place of stay in Bali, and special notes.
            </li>
            <li>
              <strong>Participation eligibility data (only when needed):</strong> age, or weight, or
              a declaration that there are no health reasons preventing participation, only for
              activities that require it.
            </li>
            <li>
              <strong>Payment data:</strong> card details are processed directly by the payment
              gateway and we do not keep them. We keep only the transaction reference and its
              status, and the transfer receipt in the case of a bank transfer.
            </li>
            <li>
              <strong>Geographic location:</strong> only with your consent, to use the nearby places
              feature on the map, and we do not store it permanently.
            </li>
            <li>
              <strong>Technical usage data:</strong> device and browser type, the pages you visit,
              and cookies, in accordance with the <strong>Cookie Policy</strong>.
            </li>
          </ul>
          <h3>2. Purposes of processing and legal basis</h3>
          <PolicyTable
            head={['Purpose', 'Legal basis']}
            rows={[
              [
                'Carrying out orders and bookings and sending confirmations and files',
                'Performance of the contract with you',
              ],
              [
                'Contacting you about your booking (WhatsApp, email, phone call)',
                'Performance of the contract',
              ],
              [
                'Checking eligibility to take part in activities',
                'Performance of the contract and protection of your safety',
              ],
              [
                'Processing payments and preventing fraud',
                'Performance of the contract and legitimate interest',
              ],
              ['Customer service and handling complaints', 'Performance of the contract'],
              ['Accounting and legal obligations', 'Legal obligation'],
              [
                'Improving the website and analytics',
                'Legitimate interest / your consent to cookies',
              ],
              ['Marketing messages and offers', 'Your consent, which you can withdraw at any time'],
            ]}
          />
          <p>
            We collect the minimum data necessary for each purpose, and we do not use it for a
            purpose contrary to the one it was collected for.
          </p>
          <h3>3. Sharing data</h3>
          <p>We do not sell your personal data. We share it only to the extent necessary with:</p>
          <ul>
            <li>
              <strong>The service provider carrying out the activity:</strong> name, contact number,
              number of participants, pick-up location, and eligibility data if required, after the
              booking is confirmed and only for the purpose of carrying it out.
            </li>
            <li>
              <strong>The payment gateway:</strong> the data necessary to complete the transaction
              and prevent fraud.
            </li>
            <li>
              <strong>Technical service providers:</strong> such as hosting, email, the WhatsApp
              Business platform and analytics tools, under contractual obligations to protect the
              data.
            </li>
            <li>
              <strong>Official authorities:</strong> when there is a binding legal request.
            </li>
          </ul>
          <h3>4. Transfer of data outside the Kingdom</h3>
          <p>
            Because the activities are carried out in Indonesia, the necessary booking data has to
            be transferred to the service providers there. Some technical systems may also be hosted
            outside the Kingdom. This is done within the limits necessary to provide the service and
            in accordance with the legal controls on data transfer.
          </p>
          <h3>5. Retention period</h3>
          <ul>
            <li>
              <strong>Booking and invoice data:</strong> for as long as accounting and commercial
              regulations require.
            </li>
            <li>
              <strong>Health eligibility data:</strong> deleted after the activity is carried out.
            </li>
            <li>
              <strong>Account data:</strong> for as long as the account is active; it is deleted or
              anonymised after a request to close it, subject to what the law requires to be kept.
            </li>
            <li>
              <strong>Marketing data:</strong> until you withdraw your consent.
            </li>
          </ul>
          <h3>6. Data protection</h3>
          <p>
            We apply appropriate technical and organisational measures, including: encrypted
            connections (HTTPS), restricting access rights within the team according to need, and
            not storing card data.
          </p>
          <h3>7. Your rights</h3>
          <p>You have the right to:</p>
          <ul>
            <li>
              <strong>Be informed</strong> of the data we collect and how it is processed.
            </li>
            <li>
              <strong>Access</strong> your data and obtain a copy of it.
            </li>
            <li>
              <strong>Correction</strong> of any inaccurate or incomplete data.
            </li>
            <li>
              <strong>Destruction</strong> of your data when it is no longer needed, subject to
              legal obligations.
            </li>
            <li>
              <strong>Withdraw consent</strong> to processing that is based on your consent, such as
              marketing and geographic location.
            </li>
          </ul>
          <p>
            To exercise your rights, contact us through the contact channels shown on the website,
            and we will reply within the period set by law.
          </p>
          <h3>8. Minors&apos; data</h3>
          <p>
            We do not collect children&apos;s data directly. The data of minor participants (such as
            age) is provided by the guardian at booking and only for the purpose of safe
            participation.
          </p>
          <h3>9. Updates</h3>
          <p>
            We may update this policy, and we will inform you of material changes through the
            website or by email.
          </p>
        </PolicySection>

        <PolicySection id="cookies" title={TITLES.cookies} backToTop={TOP}>
          <h3>1. What are cookies?</h3>
          <p>
            Small files saved on your device when you visit the website; they help us run it,
            remember your preferences and understand how it is used.
          </p>
          <h3>2. Types of cookies we use</h3>
          <PolicyTable
            head={['Type', 'Purpose', 'Can they be refused?']}
            rows={[
              [
                <strong key="s">Necessary</strong>,
                'Running the website: the booking cart, signing in, security and saving the language',
                'No, the website does not work without them',
              ],
              [
                <strong key="s">Analytics</strong>,
                'Understanding the number of visits and the most used pages in order to improve the website (such as Google Analytics)',
                'Yes',
              ],
              [
                <strong key="s">Marketing</strong>,
                'Measuring the performance of advertisements and showing you relevant advertisements on other platforms (such as Meta Pixel, TikTok Pixel and Google Ads)',
                'Yes',
              ],
            ]}
          />
          <h3>3. Controlling cookies</h3>
          <ul>
            <li>
              On your first visit a message appears for you to choose the types of cookies you agree
              to, and we do not activate analytics and marketing cookies until you have agreed.
            </li>
            <li>
              You can change your choice at any time from the &quot;Cookie settings&quot; link at
              the bottom of the website, or delete the cookies from your browser settings.
            </li>
            <li>Refusing non-necessary cookies does not affect your ability to book and buy.</li>
          </ul>
          <CookieSettingsButton className={cookieButtonClass} />
          <h3>4. Third-party cookies</h3>
          <p>
            Some cookies are placed by external service providers and are subject to their own
            privacy policies. For more, see the <strong>Privacy Policy</strong>.
          </p>
        </PolicySection>

        <PolicySection id="safety" title={TITLES.safety} backToTop={TOP}>
          <p>
            Your safety is a priority. Some activities in Bali, such as ATV, buggy, rafting,
            paragliding, helicopter trips and water activities, involve natural risks or special
            requirements. This policy sets out the general rules, while{' '}
            <strong>the conditions of each activity are shown on its page before payment</strong>,
            and they are taken from the service provider carrying it out.
          </p>
          <h3>1. Conditions specific to each activity</h3>
          <p>Depending on its nature, the activity page may include:</p>
          <ul>
            <li>A minimum or maximum age.</li>
            <li>Weight or height limits.</li>
            <li>
              Health conditions that prevent participation, such as heart and back conditions,
              pregnancy and recent surgery.
            </li>
            <li>Driving requirements, such as a driving licence for some vehicles.</li>
            <li>Fitness level or ability to swim.</li>
            <li>Required clothing and equipment.</li>
          </ul>
          <h3>2. Your responsibility before booking</h3>
          <ul>
            <li>
              Reading the activity&apos;s conditions and making sure all participants are eligible
              before payment.
            </li>
            <li>Disclosing any health condition or circumstance that may affect safety.</li>
            <li>Consulting your doctor if you have any health doubts.</li>
          </ul>
          <h3>3. During the activity</h3>
          <ul>
            <li>
              Following fully the instructions of the guide or instructor and the service provider.
            </li>
            <li>
              Wearing the safety equipment provided, such as the helmet, life jacket and seat belt.
            </li>
            <li>Not taking part under the influence of alcohol or any intoxicating substances.</li>
            <li>Supervising accompanying children at all times.</li>
          </ul>
          <h3>4. Right to stop participation</h3>
          <p>
            The service provider has the right to prevent any person from taking part, or to stop
            their participation, if they do not meet the announced conditions, breach the
            instructions, or if it appears that their participation poses a danger to themselves or
            to others; the amount is not refunded in this case.
          </p>
          <h3>5. Weather conditions</h3>
          <p>
            Many activities depend on the weather and the state of the sea. The service
            provider&apos;s decision to stop or postpone for safety reasons is final, and the force
            majeure provisions in the <strong>Cancellation and Refund Policy</strong> apply to it.
          </p>
          <h3>6. Waiver and insurance</h3>
          <ul>
            <li>
              The service provider may ask you to sign an acknowledgement of risks before some
              activities.
            </li>
            <li>
              We strongly advise you to take out travel insurance that covers sports activities and
              adventures.
            </li>
          </ul>
          <h3>7. Limits of liability</h3>
          <p>
            The service provider is responsible for carrying out the activity and providing
            qualified equipment and staff. The platform is not liable for injuries resulting from a
            participant not following the instructions or concealing a health condition, within the
            limits permitted by law.
          </p>
        </PolicySection>

        <PolicySection id="complaints" title={TITLES.complaints} backToTop={TOP}>
          <p>
            We want your experience with Bali Trips to be smooth, and if a problem occurs we want to
            solve it quickly and clearly.
          </p>
          <h3>1. Contact channels</h3>
          <p>
            You can contact us by WhatsApp or by email, both shown on the &quot;Contact us&quot;
            page, or through the &quot;My Trip&quot; page. A contact number for the day of the
            activity is also provided in the booking voucher.
          </p>
          <h3>2. Submitting a complaint</h3>
          <p>So that we can handle your complaint quickly, please provide us with the following:</p>
          <ul>
            <li>The order or booking number.</li>
            <li>The name and contact number.</li>
            <li>A clear description of the problem and the date it occurred.</li>
            <li>Any supporting attachments, such as photos, payment receipts and conversations.</li>
          </ul>
          <p>
            It is preferable to submit a complaint about an activity within 7 days of its date, so
            that we are able to check it with the service provider.
          </p>
          <h3>3. Stages of handling</h3>
          <ol>
            <li>
              <strong>Receipt:</strong> we confirm receipt of your complaint and give you a number
              to follow it up.
            </li>
            <li>
              <strong>Verification:</strong> we review the booking and contact the service provider
              when needed.
            </li>
            <li>
              <strong>Resolution:</strong> we reply to you with the decision and the proposed
              solution within 5 working days; the period may be extended in complex cases, and we
              will inform you of that.
            </li>
            <li>
              <strong>Escalation:</strong> if you are not satisfied with the solution, you can ask
              for the complaint to be escalated to the platform&apos;s management for review.
            </li>
          </ol>
          <h3>4. Refund problems</h3>
          <p>
            If a refund has been approved for you and the amount has not appeared in your account
            after the period set out in the <strong>Cancellation and Refund Policy</strong>, contact
            us and we will give you the transaction reference at the bank.
          </p>
          <h3>5. Feedback and suggestions</h3>
          <p>
            We welcome your opinions, suggestions and ratings of the activities, the itineraries and
            the information on the map; they help us improve.
          </p>
        </PolicySection>

        <PolicyCta>
          <strong>Have a question about any policy?</strong>
          <Link href="/contact">Contact us</Link>
        </PolicyCta>
      </PolicyBody>
    </>
  )
}
