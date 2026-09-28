import type { Locator, Page } from "@playwright/test";
import BaseComponent from "./base-component";

export interface IWidget {
	root?: string | Locator;
	trigger?: string | Locator;
}

/**
 * Base for stateful UI components that live inside a page (a modal, a
 * dropdown, a table): it carries the component's root and trigger selectors,
 * and inherits every action/assertion from BaseComponent. `Popup` extends it.
 */
export default class Widget extends BaseComponent {
	protected root?: string | Locator;
	protected trigger?: string | Locator;
	/**
	 * Creates a new instance of the Widget class.
	 * @param page The Playwright page object.
	 * @param root The XPath selector for the widget.
	 */
	constructor(page: Page, options?: IWidget) {
		super(page);
		this.root = options?.root;
		this.trigger = options?.trigger;
	}
}
