/**
 * A collapsible section.
 *
 * Not `<details>`: a browser hides everything but the summary the instant it
 * closes, so there is nothing left on screen to animate. Driving the open state
 * ourselves means the drawer can actually slide, and it lets the trigger be a
 * real button carrying `aria-expanded`, which `<summary>` does not.
 *
 * The height animation is `grid-template-rows: 0fr -> 1fr` on a wrapper, so it
 * works from the content's own height with no measuring and no magic numbers.
 */
export interface Drawer {
  root: HTMLElement;
  body: HTMLElement;
  setOpen(open: boolean): void;
  readonly open: boolean;
}

export const createDrawer = (name: string, open = false): Drawer => {
  const root = document.createElement('section');
  root.className = 'group';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'group-trigger';
  trigger.setAttribute('aria-expanded', String(open));

  const label = document.createElement('span');
  label.textContent = name;

  const chevron = document.createElement('span');
  chevron.className = 'chevron';
  chevron.setAttribute('aria-hidden', 'true');

  trigger.append(label, chevron);

  const shell = document.createElement('div');
  shell.className = 'group-shell';

  const clip = document.createElement('div');
  clip.className = 'group-clip';

  const body = document.createElement('div');
  body.className = 'group-body';

  clip.appendChild(body);
  shell.appendChild(clip);
  root.append(trigger, shell);

  let isOpen = open;

  const apply = (next: boolean): void => {
    isOpen = next;
    root.classList.toggle('is-open', next);
    trigger.setAttribute('aria-expanded', String(next));
    // Keep collapsed content out of the tab order and off the a11y tree.
    clip.inert = !next;
  };

  apply(open);
  trigger.addEventListener('click', () => apply(!isOpen));

  return {
    root,
    body,
    setOpen: apply,
    get open() {
      return isOpen;
    },
  };
};
