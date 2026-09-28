import { faker } from "@faker-js/faker";
export function randomCode(length: number) {
	return faker.string.alphanumeric(length);
}

// Confirmed live: faker.internet.password()'s default \w pattern (letters +
// digits, no punctuation) draws each of its 15 characters uniformly at
// random, so it occasionally comes back missing an entire character class
// (e.g. no uppercase letter) by pure chance. many sign-up forms' password policy
// requires a minimum number of distinct character classes — a password
// missing one silently fails REST customer creation (the API returns a 400,
// which the caller only discovers later as a confusing "Invalid login or
// password" once it tries to log into an account that was never actually
// created).
export async function randomPassword() {
	const chars = [
		...faker.string.alpha({ length: 4, casing: "lower" }),
		...faker.string.alpha({ length: 4, casing: "upper" }),
		...faker.string.numeric(4),
		faker.helpers.arrayElement(["!", "@", "#", "$", "%", "&"]),
	];
	return faker.helpers.shuffle(chars).join("");
}
