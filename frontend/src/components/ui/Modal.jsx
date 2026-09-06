import { useEffect } from 'react';

const MAX_WIDTH = { sm: '420px', md: '580px', lg: '760px' };

/**
 * Modal — token-driven dialog wrapping .modal-* classes (index.css).
 * Backward compatible with the old components/Modal.jsx API
 * ({ isOpen, onClose, title, children }); adds optional footer/size/
 * closeOnOverlayClick and closes on Escape for keyboard accessibility.
 */
const Modal = ({
    isOpen,
    onClose,
    title,
    size = 'md',
    footer = null,
    closeOnOverlayClick = true,
    children,
}) => {
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget && closeOnOverlayClick) {
            onClose?.();
        }
    };

    return (
        <div className="modal-overlay" onMouseDown={handleOverlayClick}>
            <div
                className="modal-content"
                style={{ maxWidth: MAX_WIDTH[size] || MAX_WIDTH.md }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={title}
            >
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                        &times;
                    </button>
                </div>
                {children}
                {footer && <div className="modal-footer">{footer}</div>}
            </div>
        </div>
    );
};

export default Modal;
