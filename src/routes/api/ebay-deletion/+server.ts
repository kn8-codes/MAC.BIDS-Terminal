import { createHash } from 'crypto';
import { EBAY_VERIFICATION_TOKEN } from '$env/static/private';
import type { RequestHandler } from './$types';

const ENDPOINT_URL = 'https://mac-bids-terminal.vercel.app/api/ebay-deletion';

export const GET: RequestHandler = async ({ url }) => {
	const challengeCode = url.searchParams.get('challenge_code');

	if (!challengeCode) {
		return new Response('Missing challenge_code', { status: 400 });
	}

	const hash = createHash('sha256');
	hash.update(challengeCode);
	hash.update(EBAY_VERIFICATION_TOKEN);
	hash.update(ENDPOINT_URL);
	const challengeResponse = hash.digest('hex');

	return new Response(JSON.stringify({ challengeResponse }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { notification } = body;

		// GREYMARKET v1 does not store eBay user data — nothing to delete.
		// Log for audit trail and acknowledge.
		console.log('eBay account deletion notification:', {
			notificationId: notification?.notificationId,
			userId: notification?.data?.userId,
			eventDate: notification?.eventDate
		});
	} catch {
		// Always ack even on parse errors
	}

	return new Response(null, { status: 200 });
};
