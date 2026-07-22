// DropdownMenu.jsx
import { useEffect, useRef } from 'react';
import styles from './DropdownMenu.module.css';

const DropdownMenu = ({ title, options = [{ label: '', onClick: () => { } }], addMenu }) => {
    const menuRef = useRef(null);
    const inputRef = useRef(null);

    // סך כל זמן האנימציה הוא 0.5 שניות
    const totalAnimationTime = 0.5;
    const optionsCount = options.length;

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                inputRef.current.checked = true; // מחזיר את התפריט למצב סגור
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <label ref={menuRef} className={`${styles.main} bg-mainColor`}>
            <input ref={inputRef} className={styles.inp} type="checkbox" defaultChecked />
            {addMenu ? (
                <div className={styles.plusIcon}>
                    <span className={styles.plusBar}></span>
                    <span className={styles.plusBar}></span>
                </div>
            ) : (
                <div className={styles.bar}>
                    <span className={styles.top + ' ' + styles.barList}></span>
                    <span className={styles.middle + ' ' + styles.barList}></span>
                    <span className={styles.bottom + ' ' + styles.barList}></span>
                </div>
            )}
            {title}
            <section
                className={
                    `${styles.menuContainer} ${options.length > 7 ? styles.scrollable : ''} bg-white dark:bg-gray-800 text-mainColor dark:text-mainColor-superLight border border-gray-300 dark:border-gray-600 z-30`
                }
            >
                {options.map((option, index) => {
                    // אם יש יותר מאפשרות אחת, מחשבים עיכוב יחסי כך שהאופציה האחרונה תעכב בדיוק totalAnimationTime.
                    const delay = optionsCount > 1 ? (index / (optionsCount - 1)) * totalAnimationTime : 0;
                    return (
                        <div
                            key={index}
                            style={{ '--delay': `${delay}s` }}
                            className={`${styles.menuList} hover:bg-gray-200 hover:dark:bg-gray-600 ${option.disabled ? '!opacity-40 cursor-not-allowed' : ''}`}
                            onClick={option.disabled ? (e) => e.preventDefault() : option.onClick}
                        >
                            {option.label}
                        </div>
                    );
                })}
            </section>
        </label>
    );
};

export default DropdownMenu;