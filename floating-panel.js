/** A regular DOM window: no modal backdrop, inert ancestors or global key handler. */
export function createFloatingPanel(content) {
    const previousFocus = document.activeElement;
    const window = $('<section class="gcs-floating-window" role="dialog" aria-modal="false" aria-label="文件库">');
    const body = $('<div class="gcs-floating-body">').append(content);
    const restore = $('<button type="button" class="gcs-floating-restore menu_button">').text('文件库 · 展开').hide().appendTo('body');
    const hide = () => { window.hide(); restore.show(); previousFocus?.focus?.(); };
    const show = () => { restore.hide(); window.show(); fit(); };
    const handle = $('<header class="gcs-floating-handle">').append(
        $('<strong>').text('文件库'), $('<span>').text('可拖动 · 可同时操作聊天'),
        $('<button type="button" class="menu_button" aria-label="收起文件库">').text('收起').on('click', hide)
    );
    window.append(handle, body).appendTo('body');
    restore.on('click', show);
    window.on('keydown', event => {
        if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); hide(); }
    });
    let drag;
    handle.on('pointerdown', event => {
        if (event.button !== 0 || $(event.target).closest('button').length) return;
        const bounds = window[0].getBoundingClientRect();
        drag = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        handle[0].setPointerCapture(event.pointerId); event.preventDefault();
    }).on('pointermove', event => {
        if (!drag) return;
        window.css({ left: Math.max(0, Math.min(innerWidth-window.outerWidth(), event.clientX-drag.x)),
            top: Math.max(0, Math.min(innerHeight-window.outerHeight(), event.clientY-drag.y)), right: 'auto', bottom: 'auto' });
    }).on('pointerup pointercancel lostpointercapture', () => { drag = null; });
    const fit = () => {
        const bounds=window[0].getBoundingClientRect();
        if (window.is(':visible')) window.css({left:Math.max(0,Math.min(bounds.left,innerWidth-window.outerWidth())),top:Math.max(0,Math.min(bounds.top,innerHeight-window.outerHeight())),right:'auto',bottom:'auto'});
    };
    globalThis.window.addEventListener('resize',fit);
    return { show, hide, visible:()=>window.is(':visible'), destroy(){globalThis.window.removeEventListener('resize',fit);window.remove();restore.remove();} };
}
