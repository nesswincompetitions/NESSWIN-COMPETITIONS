import React from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';

const TermsConditions = () => {
  return (
    <div className="min-h-screen pt-32 pb-24 bg-(--color-background)">
      <div className="max-w-4xl mx-auto px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="mb-12 text-center space-y-4 fade-in">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_oklch(0.78_0.14_78/0.15)] border border-primary/20">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white tracking-tight">
            Terms & Conditions
          </h1>
          <p className="text-gray-400 text-lg">
            Last updated: April 2026
          </p>
        </div>

        {/* Content Container */}
        <div className="bg-[#0f0f0f] border border-white/5 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden fade-in-up">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
          
          <div className="relative z-10 space-y-12 text-gray-300 leading-relaxed text-[15px]">
            
            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">1.</span> Organiser Information
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>These Terms & Conditions (“Terms”) govern access to, use of, and participation in the services and competitions offered by:</p>
                <div className="bg-white/5 p-5 rounded-xl border border-white/5">
                  <p className="font-bold text-white mb-2">NESSWIN COMPETITIONS LTD</p>
                  <p className="text-sm text-gray-400 mb-4">Private limited company incorporated in England and Wales</p>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-500 w-36 inline-block">Company Number:</span> 17105471</p>
                    <p><span className="text-gray-500 w-36 inline-block">Registered Office:</span> 128 City Road, London, EC1V 2NX, United Kingdom</p>
                    <p><span className="text-gray-500 w-36 inline-block">Email:</span> <a href="mailto:support@nesswin.com" className="text-primary hover:underline">support@nesswin.com</a></p>
                  </div>
                </div>
                <p>In these Terms, “Nesswin”, “we”, “us”, and “our” refer to NESSWIN COMPETITIONS LTD. By creating an account, accessing the Platform, purchasing a ticket, submitting a Free Postal Entry, or participating in any competition, you confirm that you have read, understood, and agreed to these Terms.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">2.</span> Nature of the Platform
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Nesswin operates a platform offering skill-based prize competitions that may allow eligible users to win prizes, including but not limited to:</p>
                <ul className="list-none space-y-2">
                  {['Cars', 'Watches', 'Holidays', 'Flights', 'Accommodation', 'Electronics', 'And other prizes advertised on the Platform.'].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="pt-2">Nesswin competitions are intended to operate as skill-based competitions and not as pure games of chance, gambling, or traditional lotteries.</p>
                <p>To participate validly, a user must:</p>
                <ul className="list-none space-y-2">
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0 mt-2" />
                    <span>Correctly answer the applicable skill-based qualifying question.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0 mt-2" />
                    <span>Complete a valid entry in accordance with the relevant competition rules, whether by paid entry or by the Free Postal Entry route where available.</span>
                  </li>
                </ul>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">3.</span> Eligibility
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>To use the Platform and enter competitions, you must:</p>
                <ul className="list-none space-y-2">
                  {['Be 18 years old or over at the time of entry.', 'Have legal capacity to enter into a binding contract.', 'Provide accurate, complete, and up-to-date information.', 'Use a payment method that you are legally authorised to use.', 'Not be prohibited by law from participating in your jurisdiction.'].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0 mt-2" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="pt-2">Nesswin reserves the right to restrict or refuse participation from any country, territory, or jurisdiction for legal, regulatory, sanctions, compliance, operational, or risk reasons. Employees, contractors, consultants, partners, and immediate family members directly connected to the operation of Nesswin may be excluded from participation.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">4.</span> Account Registration
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Access to certain features requires the creation of an account. During registration, we may request:</p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {['First name and last name', 'Email address', 'Mobile phone number', 'Date of birth', 'Country of residence', 'Username', 'Any other information reasonably required'].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 bg-white/5 px-4 py-2.5 rounded-lg border border-white/5">
                      <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                      <span className="text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="pt-2 text-gray-400 bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-sm leading-relaxed">
                  <strong className="text-red-400 block mb-1">Important:</strong>
                  You agree that all information provided is true, accurate, complete, and current. False, misleading, incomplete, or unverifiable information may result in: account suspension, entry cancellation, prize forfeiture, or permanent account closure.
                </p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">5.</span> Mandatory Phone Verification
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>A verified mobile phone number is mandatory in order to participate in any competition. This requirement applies to all sign-up and login methods, including where a user registers or logs in via Apple Sign-In, Google Sign-In, or any other third-party authentication method.</p>
                <p>Nesswin may require verification via SMS one-time password (OTP), verification code, or any similar verification process.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">6.</span> Username and Public Display
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Users may be required or invited to create a username. Nesswin may display the following for transparency purposes, including in participant lists, winner pages, draw displays, promotional content, and social media announcements:</p>
                <ul className="flex flex-wrap gap-2">
                  {['Usernames', 'First names', 'First name + last initial'].map((item, i) => (
                    <li key={i} className="bg-primary/10 text-primary border border-primary/20 px-4 py-1.5 rounded-full text-sm font-medium">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">7.</span> Ticket Purchases and Payments
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>An entry submitted via paid entry is only valid once:</p>
                <ul className="list-none space-y-2">
                  {['The applicable skill question has been correctly answered.', 'The order has been submitted.', 'Payment has been successfully processed.', 'The entry has been correctly recorded in our systems.'].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-2" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="bg-white/5 p-5 rounded-xl border border-white/5 mt-6">
                  <p className="font-bold text-white mb-3">Important payment rules:</p>
                  <ul className="list-none space-y-2 text-sm text-gray-400">
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0 mt-2" />
                      <span>All ticket purchases are final.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0 mt-2" />
                      <span>Except where required by law or where a competition is cancelled by Nesswin, tickets are non-refundable.</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0 mt-2" />
                      <span>A failed, reversed, disputed, refunded, or charged-back payment may lead to automatic cancellation of the related tickets.</span>
                    </li>
                  </ul>
                </div>
                <p className="pt-2 text-sm text-gray-400 italic">For the avoidance of doubt, entries submitted through the Free Postal Entry route are governed by Section 8 and do not require payment, but must still comply with the applicable skill-based qualifying question and all relevant competition rules.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">8.</span> Free Postal Entry
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Nesswin offers a free alternative method of entry by post (“Free Postal Entry”) for certain competitions, subject to these Terms and any competition-specific rules displayed on the relevant competition page. Unless otherwise expressly stated on the relevant competition page, an eligible participant may submit one (1) free postal entry per competition.</p>
                <div className="bg-white/5 p-5 rounded-xl border border-white/5 flex flex-col md:flex-row gap-6 items-start">
                  <div className="flex-1">
                    <p className="font-medium text-white mb-2">Required Information:</p>
                    <ul className="list-none space-y-1.5 text-sm text-gray-400">
                      <li>• Full legal name & Residential address</li>
                      <li>• Mobile phone number & Email linked to account</li>
                      <li>• Nesswin username (if applicable)</li>
                      <li>• Exact competition name/reference</li>
                      <li>• Answer to the skill question (if required)</li>
                    </ul>
                  </div>
                  <div className="md:w-px md:h-32 bg-white/10 hidden md:block" />
                  <div className="flex-1">
                    <p className="font-medium text-white mb-2">Send to:</p>
                    <p className="text-sm text-gray-400 font-mono bg-black/30 p-3 rounded-lg leading-relaxed">
                      NESSWIN COMPETITIONS LTD<br/>
                      128 City Road<br/>
                      London, EC1V 2NX<br/>
                      United Kingdom
                    </p>
                  </div>
                </div>
                <p className="pt-2">A valid Free Postal Entry that complies with these Terms and the relevant Competition Rules will be treated as a Valid Entry and entered into the competition with the same chance of winning as a paid entry. <Link to="/free-postal-entry" className="text-primary hover:underline font-medium">Learn more about Free Postal Entry.</Link></p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">9.</span> No Refund Policy
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Except where required by applicable law or where a competition is cancelled by Nesswin:</p>
                <ul className="list-none space-y-2">
                  {['No refund is due if you do not win.', 'No refund is due if you change your mind.', 'No refund is due because you misunderstood the competition rules.', 'No refund is due once a valid order has been completed.'].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0 mt-2" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">10.</span> Competition Timing and Availability
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Each competition page may include prize details, ticket price, total number of tickets, number of tickets remaining, estimated closing date/time, estimated draw date/time, special conditions, and prize-specific rules. A competition may close on the stated date/time, when all tickets are sold out, if cancelled or suspended by Nesswin, or in any other manner specified on the relevant page.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">11.</span> Winner Selection and Draw Process
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>At the close of a competition, Nesswin will identify all Valid Entries, meaning entries that:</p>
                <ul className="list-none space-y-2">
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-2" />
                    <span>Correctly answered the applicable skill-based qualifying question.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-2" />
                    <span>Completed successful payment or were validly submitted via the Free Postal Entry route.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-2" />
                    <span>Comply with these Terms and the relevant Competition Rules.</span>
                  </li>
                </ul>
                <p className="pt-2">Unless otherwise stated on the relevant competition page, the winner is selected at random from the pool of valid entries that answered correctly. Nesswin may use a third-party random draw platform or service, including a platform of the type commonly known as RandomDraws, or any equivalent tool or system chosen by Nesswin to support fairness, transparency, and traceability.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">12.</span> Winner Notification
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Winners may be contacted using: email, phone call, SMS, in-app notification, or any other reasonable contact method.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">13.</span> Winner Verification
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Before any prize is awarded, Nesswin may require the winner to provide:</p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {['Valid government-issued photo ID', 'Proof of age (18+)', 'Proof of address', 'Proof of payment method ownership', 'Confirmation of phone verification', 'Additional compliance documents'].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 bg-white/5 px-4 py-2.5 rounded-lg border border-white/5">
                      <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                      <span className="text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">14.</span> Prizes and Fulfilment
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Prizes are as described on the relevant competition page. Prize images and videos may be illustrative only. The actual prize may vary reasonably depending on availability, location, supplier, exact model, or specification. Unless expressly stated otherwise, no cash alternative is guaranteed.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">15.</span> Promotional Consent
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>By entering a competition, each participant acknowledges and agrees that, if selected as a winner, Nesswin may use certain content connected to the winner, the win, and the prize handover for transparency, proof of prize fulfilment, promotion of the Platform, and marketing. This may include:</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {['Username', 'First name', 'First name + last initial', 'Photographs', 'Videos', 'Screenshots', 'Testimonials', 'Prize handover footage', 'Winner announcements'].map((item, i) => (
                    <span key={i} className="text-xs bg-white/5 border border-white/10 px-3 py-1.5 rounded-md text-gray-400">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">16.</span> Chargebacks, Fraud and Abuse
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>If a participant initiates an abusive or unjustified chargeback, fraudulent payment dispute, or otherwise attempts to recover funds improperly:</p>
                <ul className="list-none space-y-2">
                  {['Tickets may be cancelled.', 'Any pending or potential prize may be suspended or voided.', 'The account may be suspended or permanently closed.', 'Nesswin may refuse to release any prize.'].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-2" />
                      <span className="text-red-200/80">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">17.</span> Platform Availability
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>We do not guarantee uninterrupted, error-free, or defect-free operation of the Platform or related services. Nesswin may modify, suspend, update, restrict, or discontinue all or part of the Platform at any time.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">18.</span> Intellectual Property
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>All content on the Platform, including text, logos, branding, graphics, videos, designs, interfaces, software, databases, and promotional materials, belongs to Nesswin or its licensors and is protected by intellectual property laws.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">19.</span> Limitation of Liability
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Nothing in these Terms excludes or limits liability where it would be unlawful to do so, including for death or personal injury caused by negligence, fraud, fraudulent misrepresentation, or any liability that cannot legally be excluded.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">20.</span> Governing Law and Jurisdiction
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>These Terms are governed by the laws of England and Wales. Any dispute, claim, or matter arising out of or in connection with the Platform, competitions, entries, prizes, or these Terms shall be subject to the jurisdiction of the courts of England and Wales, subject to any mandatory consumer rights that may apply in the participant’s country of residence.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">21.</span> Contact and Complaints
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>For questions, concerns, or complaints:</p>
                <div className="bg-white/5 p-5 rounded-xl border border-white/5 inline-block">
                  <p className="font-bold text-white mb-2">NESSWIN COMPETITIONS LTD</p>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-500 w-36 inline-block">Email:</span> <a href="mailto:support@nesswin.com" className="text-primary hover:underline">support@nesswin.com</a></p>
                    <p><span className="text-gray-500 w-36 inline-block">Registered Office:</span> 128 City Road, London, EC1V 2NX</p>
                    <p><span className="text-gray-500 w-36 inline-block">Telephone:</span> +44 7488 87 6770</p>
                  </div>
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsConditions;
