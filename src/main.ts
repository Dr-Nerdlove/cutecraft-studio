import './style.css';
import { initLang } from './i18n';
import { initTheme } from './ui/theme';
import { mountApp } from './ui/app';

initLang();
initTheme();
const root = document.getElementById('app');
if (root) mountApp(root);
