import { faker } from "@faker-js/faker";

/**
 * Non-secret test data for the DemoBlaze suite. Credentials never live here —
 * see src/fixtures/shop-fixtures.ts for how accounts are resolved.
 *
 * Product ids/titles are the site's seeded catalogue (first page of
 * `/entries`). Prices are listed for the API specs only; UI specs read the
 * price off the product page and compare it with the cart, so a catalogue
 * price change cannot break them.
 */
export const PRODUCTS = {
	samsungGalaxyS6: { id: 1, title: "Samsung galaxy s6", price: 360 },
	nokiaLumia1520: { id: 2, title: "Nokia lumia 1520", price: 820 },
	nexus6: { id: 3, title: "Nexus 6", price: 650 },
	sonyVaioI5: { id: 8, title: "Sony vaio i5", price: 790 },
} as const;

/** The Place order form. Only `name` and `card` are required by the site. */
export interface OrderDetails {
	name: string;
	card: string;
	country?: string;
	city?: string;
	month?: string;
	year?: string;
}

/** A complete, valid order form with unique values per call. */
export function buildOrderDetails(
	overrides: Partial<OrderDetails> = {},
): OrderDetails {
	return {
		name: faker.person.fullName(),
		country: faker.location.country(),
		city: faker.location.city(),
		// Visa test number: passes a Luhn check, charges nothing anywhere.
		card: "4111111111111111",
		month: String(faker.number.int({ min: 1, max: 12 })),
		year: String(new Date().getFullYear() + 2),
		...overrides,
	};
}

/** Exact alert texts from the site's own JS (index.js, prod.js, cart.js). */
export const ALERTS = {
	loginFieldsRequired: "Please fill out Username and Password.",
	userDoesNotExist: "User does not exist.",
	wrongPassword: "Wrong password.",
	productAddedUser: "Product added.",
	productAddedGuest: "Product added",
	orderFieldsRequired: "Please fill out Name and Creditcard.",
	userAlreadyExists: "This user already exist.",
	tokenMalformed: "Bad parameter, token malformed.",
} as const;
