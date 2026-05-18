# Screenshot Fixes Checklist

Created: 2026-05-04

This checklist consolidates the issues captured from the screenshots into a single markdown worklist.
use [$supabase-postgres-best-practices](E:\\React-Native-Projects\\MusikaLokal\\.agents\\skills\\supabase-postgres-best-practices\\SKILL.md) 

## UI / Layout Fixes

- [ ] Center the Back button.
- [ ] Center the Back button in Create Group.
- [ ] Center the input text field.
- [ ] Remove the Back button from Group Info, Members, and Review pages.
- [ ] Improve the AI suggestion section UI and improve the chatbot too.
- [ ] Improve the contract and agreement UI in listing cards.
- [ ] Improve the listing details UI, especially the Terms and Contracts section this is sometimes redundant to its modal confirmation there is somtimes contract there double check it.
- [ ] Improve the Submit Application modal UI.
- [ ] Improve preferred slot and apply-as selection in both solo and duo flows, and prevent users from choosing duo when applying solo.
- [ ] Add View Details in History.

## Group / Member Issues

- [ ] Fix the Group page so members are displayed.
- [ ] Fix Manage Group application visibility.
- [ ] Show group applications in the Bookings page.
- [ ] Fix musician-side group data fetching in the Bookings page.
- [ ] When accepting a group into production, display the full group properly in the Manage page instead of only members.
- [ ] Remove the reserve option from group modals.

## Application / Booking Rules

- [ ] Prevent duplicate applications for musician-to-production, musician-to-group, and similar application flows.
- [ ] In venue-facing active and history bookings, show duo applications and group entries as Group instead of the leader name.
- [ ] Remove reserve behavior where a notification redirects to musician View Application.

## Invite Features
 i think the three group management, venue, production is almost all the same dont you think can you check it all of there pages and flow check it
for the production side
- [ ] Add a group invite feature similar to Production to Musician.
- [ ] Add group invite in Add, Edit, and Manage pages.
- [ ] Add a production invite member feature in Manage pages.

## Venue / Equipment / Production

- [ ] Allow custom equipment image upload without requiring cropping, matching other image upload flows.
- [ ] Remove experience level from Add Venue and Edit Venue.
- [ ] Remove the production partnership section from Create Venue and Create/Edit Venue.

## Notifications

- [ ] Fix missing Fire notifications in the Notifications page.
- [ ] Fix the notification redirect issue related to reserve behavior in musician View Application.

## Buttons / Interaction Fixes

- [ ] Fix double-click issues on all delete buttons across pages and modals.
- [ ] Fix fallback errors.

## Navigation / Tabs

- [ ] Review tab behavior.
- [ ] Make sure Manage Group appears in the application tab or page.
- [ ] Make sure group applications appear in the Bookings page.