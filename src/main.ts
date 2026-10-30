import './style.css';
import { initLang } from './i18n';
import { mountApp } from './ui/app';

initLang();
const root = document.getElementById('app');
if (root) mountApp(root);
