import React, { useState, useEffect, useContext, createContext, useCallback } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { Settings, Sparkles, RefreshCw, Newspaper, TrendingUp, Calendar, Share2, Bookmark, X, ArrowLeft, User, Globe, Zap, Moon, Sun, BookOpen, LogIn, LogOut, Search, Award, ChevronDown } from 'lucide-react';
import { analytics, auth, googleProvider, db } from './lib/firebase';
import { logEvent } from "firebase/analytics";
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const decodeEntities = (text) => {
  if (!text) return "";
  const textArea = document.createElement('textarea');
  textArea.innerHTML = text;
  let decoded = textArea.value;
  
  // Garante que o texto está em UTF-8 corretamente decodificado
  try {
    return decodeURIComponent(escape(decoded));
  } catch(e) {
    return decoded;
  }
};

const updateMetaTags = (title, description, image) => {
  document.title = title || "Gazetta | O Seu Jornal Inteligente";
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', description || "Notícias curadas por IA.");
  
  // Open Graph Social Media
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', title);
  
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', description);

  const ogImg = document.querySelector('meta[property="og:image"]');
  if (ogImg) ogImg.setAttribute('content', image || "/fallbacks/gazetta.png");
};

const fixEncoding = (text) => {
  if (!text) return "";
  // Resolve problemas comuns de caracteres corrompidos vindos de RSS antigos
  const map = {
    'Ã¡': 'á', 'Ã ': 'à', 'Ã¢': 'â', 'Ã£': 'ã', 'Ã¤': 'ä',
    'Ã©': 'é', 'Ã¨': 'è', 'Ãª': 'ê', 'Ã«': 'ë',
    'Ã\xad': 'í', 'Ã¬': 'ì', 'Ã®': 'î', 'Ã¯': 'ï',
    'Ã³': 'ó', 'Ã²': 'ò', 'Ã´': 'ô', 'Ãµ': 'õ', 'Ã¶': 'ö',
    'Ãº': 'ú', 'Ã¹': 'ù', 'Ã»': 'û', 'Ã¼': 'ü',
    'Ã§': 'ç', 'Ã\x81': 'Á', 'Ã\x80': 'À', 'Ã\x82': 'Â', 'Ã\x83': 'Ã',
    'Ã\x89': 'É', 'Ã\x8a': 'Ê', 'Ã\x8d': 'Í', 'Ã\x93': 'Ó', 'Ã\x94': 'Ô',
    'Ã\x95': 'Õ', 'Ã\x9a': 'Ú', 'Ã\x87': 'Ç', 'â\x80\x9c': '"', 'â\x80\x9d': '"',
    'â\x80\x98': "'", 'â\x80\x99': "'", 'â\x80\x94': '—', 'â\x80\x93': '–'
  };
  let fixed = text;
  Object.keys(map).forEach(key => {
    fixed = fixed.replace(new RegExp(key, 'g'), map[key]);
  });
  return fixed;
};

const cleanHTMLContent = (htmlString) => {
  if (!htmlString) return "Conteúdo não disponível.";

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // 1. Remove anúncios de scripts, vídeos, AlpineJS widgets e afins.
  const adsAndScripts = doc.querySelectorAll('script, iframe, noscript, object, embed, [x-data], form, aside');
  adsAndScripts.forEach(el => el.remove());

  // 2. Remove TODAS as imagens de dentro da notícia, para focar na leitura e deixar apenas o banner emoldurado
  const allImages = doc.querySelectorAll('img, picture, figure');
  allImages.forEach(img => img.remove());

  return doc.body.innerHTML;
};

const GLOBAL_SOURCES = [
  // BRASIL (Popular)
  { id: "g1_eco", name: "G1 Economia", url: "https://g1.globo.com/rss/g1/economia/", category: "Brasil", popular: true },
  { id: 'folha_mundo', name: 'Folha - Mundo', url: 'https://feeds.folha.uol.com.br/mundo/rss091.xml', category: 'Mundo', popular: true },
  { id: 'estadao_br', name: 'Estadão', url: 'https://www.estadao.com.br/arc/outboundfeeds/rss/categoria/brasil/', category: 'Brasil', popular: true },
  { id: "valor", name: "Valor", url: "https://valor.globo.com/rss/valor/", category: "Brasil", popular: true },
  { id: "uol_noticias", name: "UOL Notícias", url: "https://rss.uol.com.br/feed/noticias.xml", category: "Brasil", popular: true },
  { id: "cnn_br", name: "CNN Brasil", url: "https://www.cnnbrasil.com.br/feed/", category: "Brasil", popular: true },
  { id: "nexo", name: "Nexo Jornal", url: "https://www.nexojornal.com.br/rss/", category: "Brasil" },
  { id: "poder360", name: "Poder360", url: "https://www.poder360.com.br/feed/", category: "Brasil" },
  { id: "metropoles", name: "Metrópoles", url: "https://www.metropoles.com.br/feed", category: "Brasil" },
  { id: "r7", name: "R7 Notícias", url: "https://noticias.r7.com/feed.xml", category: "Brasil" },
  
  // TECNOLOGIA (Popular)
  { id: "tecnoblog", name: "Tecnoblog", url: "https://tecnoblog.net/feed/", category: "Tecnologia", popular: true },
  { id: "canaltech", name: "Canaltech", url: "https://canaltech.com.br/rss/", category: "Tecnologia", popular: true },
  { id: "meio_bit", name: "Meio Bit", url: "https://meiobit.com/feed/", category: "Tecnologia", popular: true },
  { id: "macmagazine", name: "MacMagazine", url: "https://macmagazine.com.br/feed/", category: "Tecnologia", popular: true },
  { id: "gizmodo_br", name: "Gizmodo Brasil", url: "https://gizmodo.uol.com.br/feed/", category: "Tecnologia", popular: true },
  { id: "olhar_digital", name: "Olhar Digital", url: "https://olhardigital.com.br/feed/", category: "Tecnologia" },
  { id: "techcrunch", name: "TechCrunch", url: "https://techcrunch.com/feed/", category: "Tecnologia", popular: true },
  { id: "the_verge", name: "The Verge", url: "https://www.theverge.com/rss/index.xml", category: "Tecnologia", popular: true },
  { id: "wired", name: "Wired", url: "https://www.wired.com/feed/rss", category: "Tecnologia", popular: true },
  { id: "arstechnica", name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", category: "Tecnologia", popular: true },
  { id: "engadget", name: "Engadget", url: "https://www.engadget.com/rss.xml", category: "Tecnologia" },
  
  // MUNDO (Popular)
  { id: "bbc_br", name: "BBC Brasil", url: "https://feeds.bbci.co.uk/portuguese/rss.xml", category: "Mundo", popular: true },
  { id: "reuters_world", name: "Reuters World", url: "https://www.reutersagency.com/feed/?best-topics=world-news&post_type=best", category: "Mundo", popular: true },
  { id: "nytimes", name: "NY Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", category: "Mundo", popular: true },
  { id: "the_guardian", name: "The Guardian", url: "https://www.theguardian.com/world/rss", category: "Mundo", popular: true },
  { id: "al_jazeera", name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.rss", category: "Mundo" },
  { id: "dw_br", name: "DW Brasil", url: "https://rss.dw.com/rdf/rss-br-top", category: "Mundo" },
  
  // NEGÓCIOS / ECONOMIA
  { id: "exame", name: "Exame", url: "https://exame.com/feed/", category: "Negócios", popular: true },
  { id: "bloomberg", name: "Bloomberg", url: "https://www.bloomberg.com/politics/feeds/site.xml", category: "Negócios" },
  { id: "forbes_br", name: "Forbes Brasil", url: "https://forbes.com.br/feed/", category: "Negócios" },
  { id: "infomoney", name: "InfoMoney", url: "https://www.infomoney.com.br/feed/", category: "Negócios" },
  { id: "money_times", name: "Money Times", url: "https://www.moneytimes.com.br/feed/", category: "Negócios" },
  { id: "brazil_journal", name: "Brazil Journal", url: "https://braziljournal.com/feed/", category: "Negócios" },
  
  // GEEK / CULTURA
  { id: "jovem_nerd", name: "Jovem Nerd", url: "https://jovemnerd.com.br/feed/", category: "Geek", popular: true },
  { id: "omelete", name: "Omelete", url: "https://www.omelete.com.br/rss", category: "Geek" },
  { id: "ign_br", name: "IGN Brasil", url: "https://br.ign.com/feed.xml", category: "Geek" },
  { id: "techtudo", name: "TechTudo", url: "https://home/globo/techtudo/rss/feed.xml", category: "Geek" },
  { id: "adorocinema", name: "AdoroCinema", url: "http://www.adorocinema.com/rss/noticias.xml", category: "Geek" },
  
  // CIÊNCIA / SAÚDE
  { id: "natgeo", name: "National Geographic", url: "https://www.nationalgeographic.com/index.rss", category: "Ciência" },
  { id: "nasa", name: "NASA News", url: "https://www.nasa.gov/rss/dyn/breaking_news.rss", category: "Ciência" },
  { id: "sciam", name: "Scientific American", url: "http://rss.sciam.com/ScientificAmerican-Global", category: "Ciência" },
  { id: "drauzio", name: "Drauzio Varella", url: "https://drauziovarella.uol.com.br/feed/", category: "Saúde" },
  { id: "variety", name: "Variety", url: "https://variety.com/feed/", category: "Cultura" },
  { id: "rolling_stone", name: "Rolling Stone", url: "https://rollingstone.uol.com.br/rss/noticias/", category: "Cultura" },
  
  // ESPORTES
  { id: "ge_top", name: "GE - Globo Esporte", url: "https://ge.globo.com/rss/ge/", category: "Esportes", popular: true },
  { id: "espn", name: "ESPN Brasil", url: "https://www.espn.com.br/rss/noticias", category: "Esportes", popular: true },
  { id: "gazeta_esportiva", name: "Gazeta Esportiva", url: "https://www.gazetaesportiva.com/feed/", category: "Esportes" },

  // ESTILO DE VIDA (Lifestyle/Beleza)
  { id: "vogue_br", name: "Vogue Brasil", url: "https://vogue.globo.com/rss/vogue/", category: "Estilo de Vida", popular: true },
  { id: "casa_vogue", name: "Casa Vogue", url: "https://casavogue.globo.com/rss/casavogue/", category: "Estilo de Vida" },
  { id: "gq_br", name: "GQ Brasil", url: "https://gq.globo.com/rss/gq/", category: "Estilo de Vida" },
  { id: "billboard", name: "Billboard", url: "https://www.billboard.com/feed/", category: "Cultura" }
];

const AD_KEYWORDS = ['oferta', 'promoção', 'desconto', 'cupom', 'barato', 'preço', 'comprar', 'imperdível', 'liquidação'];

const FALLBACK_IMAGES = [
  '/fallbacks/fallback2.png',
  '/fallbacks/fallback3.png',
  '/fallbacks/fallback4.png',
  '/fallbacks/fallback5.png',
  '/fallbacks/fallback6.png',
  '/fallbacks/globe.png',
  '/fallbacks/gazetta.png'
];

const getFallbackImage = (articleId) => {
  // Usa o ID do artigo para sempre retornar a mesma imagem de fallback para o mesmo artigo
  const index = Math.abs(parseInt(articleId, 36) || 0) % FALLBACK_IMAGES.length;
  return FALLBACK_IMAGES[index];
};

const SettingsContext = createContext({});
const useSettings = () => useContext(SettingsContext);

const ArticleView = ({ news, lastUpdate }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { theme, toggleBookmark, isBookmarked, handleShare, darkMode } = useSettings();
  const [readMode, setReadMode] = useState(false);

  const article = news.find(n => String(n.id) === id) || JSON.parse(localStorage.getItem('gazetta_bookmarks') || '[]').find(n => String(n.id) === id);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  if (!article) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center", theme.bg, theme.text)}>
        <div className="text-center">
          <Newspaper className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-xl font-bold">Artigo não encontrado</p>
          <button onClick={() => navigate('/')} className={cn("mt-4 underline transition-colors", theme.accentHover)}>Voltar à Edição</button>
        </div>
      </div>
    );
  }

  const articleURL = window.location.href;

  return (
    <div className={cn("min-h-screen relative transition-colors duration-300", readMode ? (darkMode ? "bg-[#111] text-[#ccc]" : "bg-[#fcfaf5] text-[#222]") : cn(theme.bg, theme.text))}>
      {!readMode && <div className="paper-texture" />}

      {!readMode && (
        <header className={cn("sticky top-0 z-[100] backdrop-blur-md border-b py-4 px-4 md:px-12 flex justify-between items-center", darkMode ? "bg-[#1a1a1a]/90 border-gray-700" : "bg-[#f4f1ea]/90 border-black")}>
          <button
            onClick={() => navigate('/')}
            className={cn("flex items-center gap-2 text-[10px] font-black uppercase transition-colors group", theme.accentHover)}
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span>Voltar à Edição</span>
          </button>
          <h2 className="newspaper-title text-2xl md:text-3xl select-none">Gazetta</h2>
          <div className="hidden md:flex items-center gap-4 text-[9px] font-black uppercase tracking-widest opacity-60">
            <span>{article.category}</span>
            <span>•</span>
            <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> Cobertura Global</span>
          </div>
        </header>
      )}

      {readMode && (
        <button onClick={() => setReadMode(false)} className="fixed top-6 left-6 z-[200] flex items-center gap-2 p-2 bg-black/10 hover:bg-black/20 rounded-full transition-colors backdrop-blur-md">
          <X className="w-5 h-5" />
        </button>
      )}

      <div className={cn("mx-auto px-4", readMode ? "max-w-2xl py-12" : "max-w-4xl py-20")}>
        <article className="font-serif relative">

          <div className={cn("absolute right-0 flex gap-4", readMode ? "-top-2" : "-top-12")}>
            <button onClick={() => setReadMode(!readMode)} className={cn("p-2 rounded-full transition-colors", readMode ? "bg-black text-white" : "hover:bg-black/10")} title="Modo Leitura">
              <BookOpen className="w-4 h-4" />
            </button>
            <button onClick={() => toggleBookmark(article)} className={cn("p-2 rounded-full transition-colors flex items-center justify-center", isBookmarked(article) ? theme.accent : theme.text, readMode ? "" : "hover:bg-black/10")} title="Salvar">
              <Bookmark className={cn("w-4 h-4", isBookmarked(article) ? "fill-current" : "")} />
            </button>
            <button onClick={() => handleShare(article.title, articleURL)} className={cn("p-2 rounded-full transition-colors", readMode ? "" : "hover:bg-black/10")} title="Compartilhar">
              <Share2 className="w-4 h-4" />
            </button>
          </div>

          <header className={cn("mb-12 border-b-4 pb-10", readMode && "border-b-0 pb-4 mb-8", theme.border)}>
            {!readMode && (
              <div className="flex items-center gap-3 mb-4">
                <span className={cn("font-bold uppercase text-xs tracking-widest", theme.accent)}>{article.category}</span>
                {article.isTrending && <span className={cn("px-2 py-0.5 text-[8px] font-black uppercase flex items-center gap-1", theme.invertedBg)}><Zap className="w-2.5 h-2.5" /> Viral</span>}
              </div>
            )}
            <h1 className={cn("font-black leading-[1.05] mb-8 tracking-tighter", readMode ? "text-3xl md:text-5xl" : "text-4xl md:text-7xl uppercase")}>{article.title}</h1>
            <div className={cn("flex justify-between items-center text-[10px] uppercase font-bold border-t pt-6", readMode && "border-t-0 pt-0", theme.muted, theme.borderObj)}>
              <span className="flex items-center gap-2"><User className="w-3 h-3" /> Correspondente: {article.author}</span>
              <span>{article.time} • Fonte: {article.source}</span>
            </div>
          </header>

          {article.image && (
            <div className={cn("mb-16", readMode ? "rounded-lg overflow-hidden" : cn("border p-1 shadow-[20px_20px_0px_0px_rgba(0,0,0,1)]", theme.border, theme.boxBg))}>
              <img 
                src={article.image} 
                className="w-full" 
                alt="" 
                onError={(e) => {
                  e.target.onerror = null; 
                  e.target.src = getFallbackImage(article.id);
                }}
              />
              {!readMode && (
                <div className="mt-4 flex justify-between items-center px-4 mb-2">
                  <span className={cn("text-[8px] uppercase font-bold", theme.muted)}>Arquivo Digital Gazetta Intelligence</span>
                </div>
              )}
            </div>
          )}

          <div
            className={cn(
              "leading-[1.6] space-y-10 prose prose-newspaper max-w-none prose-img:hidden",
              readMode ? "font-sans text-lg md:text-xl text-opacity-90" : "font-serif text-xl md:text-2xl",
              darkMode ? "prose-invert" : ""
            )}
            dangerouslySetInnerHTML={{ __html: article.content }}
          />

          {article.content && article.content.replace(/<[^>]+>/g, '').length < 400 && (
            <div className={cn("mt-12 p-6 md:p-8 border-2 text-center", theme.border, theme.boxBg)}>
              <p className={cn("mb-6 font-bold text-lg md:text-xl", theme.text)}>Esta fonte disponibiliza apenas o resumo através do canal público (RSS).</p>
              <a href={article.link} target="_blank" rel="noreferrer" className={cn("inline-block px-6 py-4 text-xs md:text-sm font-black uppercase tracking-widest transition-transform hover:scale-105", theme.invertedBg)}>
                Ler Matéria Completa na Fonte ({article.source})
              </a>
            </div>
          )}

          {!readMode && (
            <div className={cn("mt-32 pt-16 border-t-4 text-center opacity-40", theme.border)}>
              <Newspaper className="w-16 h-16 mx-auto mb-6" />
              <p className="mb-2 text-sm font-bold font-sans uppercase tracking-[0.3em]">Gazetta Digital Intelligence</p>
              <p>&copy; 2026 — Algoritmo de Consenso Global</p>
              <a href={article.link} target="_blank" rel="noreferrer" className={cn("text-[10px] uppercase font-black hover:underline mt-8 block transition-colors", theme.accentHover)}>Verificar Documentação de Origem</a>
            </div>
          )}
        </article>
      </div>
    </div>
  );
};

// Componente Principal da Lista
const NewsList = ({ news, isLoading, lastUpdate, showSettings, setShowSettings, curateNews, isLoadingMore }) => {
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { theme, toggleBookmark, isBookmarked, handleShare, interests, currentCategory, setCurrentCategory, toggleTheme, darkMode, bookmarks, showBookmarks, setShowBookmarks, user, login, logout, collectibles } = useSettings();

  const openArticle = (articleId) => {
    const article = [...news, ...bookmarks].find(n => n.id === articleId);
    if (article && analytics) {
      logEvent(analytics, 'select_content', {
        content_type: 'article',
        item_id: articleId,
        item_name: article.title
      });
    }
    navigate(`/article/${articleId}`);
  };

  const categories = ["Todas", "Mundo", "Brasil", "Tecnologia", "Negócios", "Esportes", "Cultura", "Ciência", "Estilo de Vida"];

  const displayedNews = currentCategory === "Todas" || showBookmarks
    ? (showBookmarks ? bookmarks : news)
    : news.filter(n => n.category.toLowerCase().includes(currentCategory.toLowerCase()));

  useEffect(() => {
    updateMetaTags(
      currentCategory === "Todas" ? "Gazetta | O Seu Jornal Inteligente" : `${currentCategory} | Gazetta`,
      `Últimas notícias da editoria de ${currentCategory} na Gazetta.`,
      "/fallbacks/gazetta.png"
    );

    if (analytics) {
      logEvent(analytics, 'page_view', {
        page_title: currentCategory,
        page_location: window.location.href,
        page_path: window.location.pathname
      });
    }
  }, [currentCategory, analytics]);

  return (
    <>
      <header className="max-w-7xl mx-auto px-4 md:px-12 pt-8 pb-4">
        {/* Topbar Utility */}
        <div className={cn("flex flex-col md:flex-row justify-between items-center mb-6 border-b pb-2 text-[10px] md:text-xs uppercase tracking-[0.2em] font-bold", theme.border)}>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2 mb-2 md:mb-0">
            <span className={cn("flex items-center gap-2", theme.accent)}><Globe className="w-3 h-3" /> Notícias do mundo todo</span>
            <span className="hidden md:inline opacity-30">|</span>
            <span className="flex items-center gap-1 opacity-70">
              <Calendar className="w-3 h-3" />
              {lastUpdate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={toggleTheme} className={cn("flex items-center gap-2 transition-transform hover:scale-110", theme.muted)}>
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <span>|</span>
            <button onClick={() => setShowBookmarks(!showBookmarks)} className={cn("flex items-center gap-2 hover:underline transition-colors", showBookmarks ? theme.accent : theme.text)}>
              <Bookmark className={cn("w-3 h-3", showBookmarks ? "fill-current" : "")} />
              Meus Arquivos ({bookmarks.length})
            </button>
            <span>|</span>
            {user ? (
              <div className="relative">
                <button 
                  onClick={() => setShowUserMenu(!showUserMenu)} 
                  className={cn("flex items-center gap-2 hover:bg-black/5 px-2 py-1 rounded transition-colors", theme.text)}
                >
                  {user.photoURL ? <img src={user.photoURL} className="w-5 h-5 rounded-full" /> : <User className="w-3 h-3" />}
                  <span className="hidden sm:inline">Olá, {user.displayName?.split(' ')[0]}</span>
                  <ChevronDown className={cn("w-3 h-3 transition-transform", showUserMenu && "rotate-180")} />
                </button>
                
                <AnimatePresence>
                  {showUserMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }} 
                        animate={{ opacity: 1, y: 0, scale: 1 }} 
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className={cn("absolute right-0 mt-2 w-56 border-2 p-2 z-50 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]", theme.bg, theme.border)}
                      >
                        <div className="px-3 py-3 border-b-2 mb-2 flex items-center gap-3">
                          {user.photoURL && <img src={user.photoURL} className="w-8 h-8 rounded-full border-2 border-black/10" />}
                          <div className="overflow-hidden">
                            <p className="text-[10px] font-black truncate">{user.displayName}</p>
                            <p className="text-[8px] opacity-50 truncate uppercase font-bold tracking-tighter">{user.email}</p>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <button onClick={() => setShowUserMenu(false)} className="w-full flex items-center justify-between px-3 py-2 text-[10px] uppercase font-black hover:bg-black/5 text-left transition-colors group">
                            <span className="flex items-center gap-2"><Award className="w-4 h-4 py-0.5" /> Meus Selos</span>
                            <span className={cn("bg-black text-white px-1.5 py-0.5 rounded text-[8px]", theme.bgAccent)}>{collectibles?.length || 0}</span>
                          </button>
                          
                          <button onClick={() => { setShowUserMenu(false); setShowSettings(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-[10px] uppercase font-black hover:bg-black/5 text-left transition-colors">
                            <Settings className="w-4 h-4 py-0.5" /> Configurar Jornal
                          </button>

                          <div className={cn("h-px my-2 mx-2", darkMode ? "bg-white/10" : "bg-black/10")} />

                          <button onClick={() => { setShowUserMenu(false); logout(); }} className={cn("w-full flex items-center gap-2 px-3 py-2 text-[10px] uppercase font-black hover:bg-red-50 text-left transition-colors", theme.accent)}>
                            <LogOut className="w-4 h-4 py-0.5" /> Sair da Gazetta
                          </button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button onClick={login} className={cn("flex items-center gap-2 hover:underline transition-colors", theme.accent)}>
                <LogIn className="w-3 h-3" />
                <span>Login</span>
              </button>
            )}
          </div>
        </div>

        {/* Hero Title */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center mb-6">
          <h1 className="newspaper-title text-7xl md:text-[10rem] leading-none mb-2 select-none group cursor-pointer" onClick={() => { setShowBookmarks(false); setCurrentCategory("Todas"); }}>
            Gazetta
          </h1>
          <div className={cn("flex items-center justify-center gap-4 md:gap-12 py-2 border-y-2 mt-4", theme.border)}>
            <span className="hidden sm:block text-[10px] uppercase font-bold tracking-widest flex-1 text-right">Tecnologia, Economia e tudo que você quiser</span>
            <div className="text-sm italic font-serif px-8 whitespace-nowrap">"Mundus in notitia"</div>
            <span className="hidden sm:block text-[10px] uppercase font-bold tracking-widest flex-1 text-left">Curadoria das principais notícias do mundo</span>
          </div>
        </motion.div>

        {/* Categories / Tabs */}
        {!showBookmarks && (
          <div className="flex flex-wrap justify-center items-center gap-4 pb-6 pt-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCurrentCategory(cat)}
                className={cn("text-[10px] font-black uppercase tracking-widest px-3 py-1 transition-all rounded-none",
                  currentCategory === cat ? theme.invertedBg : cn("hover:opacity-70", theme.text)
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Middle Bar */}
        <div className={cn("flex flex-wrap justify-between items-center border-b-4 py-3 gap-4 mb-12", theme.border)}>
          <div className="flex items-center gap-3 py-1">
            <span className={cn("text-[10px] font-black uppercase tracking-tighter px-2 py-0.5", theme.invertedBg)}>
              {showBookmarks ? "Arquivados:" : "Top Trends:"}
            </span>
            <div className="flex gap-4 overflow-x-auto no-scrollbar max-w-[500px]">
              {!showBookmarks && ["IA", "Brasil", "Tech", "Global", "Economia"].map(t => (
                <span key={t} className="text-[10px] font-bold uppercase opacity-60 hover:opacity-100 cursor-default">#{t}</span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 text-xs uppercase font-black hover:scale-105 transition-transform">
              <Settings className="w-4 h-4" /> Configurar Jornal
            </button>
            <button onClick={() => curateNews(true)} className="flex items-center gap-2 text-xs uppercase font-black hover:scale-105 transition-transform" disabled={isLoading}>
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} /> Sincronizar Agora
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-12">
        <AnimatePresence mode="wait">
          {isLoading && news.length === 0 ? (
            <div className="py-40 text-center">
              <div className="relative inline-block mb-8">
                <Globe className="w-16 h-16 mx-auto animate-spin-slow opacity-20" />
                <Zap className={cn("absolute top-0 right-0 w-6 h-6 animate-pulse", theme.accent)} />
              </div>
              <div className="flex items-center justify-center gap-2">
                <p className="text-[10px] uppercase font-black tracking-widest">Preparando Notícias</p>
                <div className="flex gap-1">
                  <span className={cn("w-1 h-1 rounded-full animate-pulse", theme.bgAccent)} style={{ animationDelay: '0s' }}></span>
                  <span className={cn("w-1 h-1 rounded-full animate-pulse", theme.bgAccent)} style={{ animationDelay: '0.2s' }}></span>
                  <span className={cn("w-1 h-1 rounded-full animate-pulse", theme.bgAccent)} style={{ animationDelay: '0.4s' }}></span>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              <div className="lg:col-span-9">
                {displayedNews.length === 0 && (
                  <div className="text-center py-20 opacity-50">
                    <Bookmark className="w-12 h-12 mx-auto mb-4" />
                    <p className="text-xl font-bold">Nenhum artigo encontrado nesta seção.</p>
                  </div>
                )}

                {displayedNews.filter(n => n.featured).map(item => (
                  <article key={item.id} className={cn("border-b pb-12 mb-12", theme.borderObj)}>
                    <div className="flex flex-col lg:flex-row gap-10">
                      <div className="lg:w-7/12 order-2 lg:order-1">
                        <div className="flex items-center justify-between gap-2 mb-4">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest", theme.bgAccent)}>Manchete</span>
                            {item.isTrending && <span className="flex items-center gap-1 text-[9px] font-black uppercase text-orange-600"><Zap className="w-3 h-3" /> Em Alta</span>}
                          </div>
                          {showBookmarks && <span className="text-[10px] uppercase font-black opacity-50">ARQUIVADO</span>}
                        </div>
                        <h2 onClick={() => openArticle(item.id)} className={cn("text-4xl md:text-6xl font-black leading-[1.05] mb-6 hover:underline cursor-pointer decoration-4", theme.accentDecor)}>{item.title}</h2>
                        <p className={cn("text-xl md:text-2xl leading-snug mb-8 italic first-letter:text-6xl first-letter:font-black first-letter:float-left first-letter:mr-3 first-letter:leading-none", theme.muted, theme.firstLetter)}>{item.summary}</p>
                        <div className={cn("flex justify-between items-center text-xs uppercase font-bold border-t border-dotted pt-6", theme.muted, theme.borderObj)}>
                          <span className="flex items-center gap-2"><Globe className="w-4 h-4" /> {item.source} • {item.date}</span>
                          <div className="flex gap-4">
                            <Share2 onClick={() => handleShare(item.title, `${window.location.origin}/article/${item.id}`)} className="w-4 h-4 cursor-pointer hover:scale-110 transition-transform" />
                            <Bookmark onClick={() => toggleBookmark(item)} className={cn("w-4 h-4 cursor-pointer hover:scale-110 transition-transform", isBookmarked(item) && theme.accent, isBookmarked(item) && "fill-current")} />
                          </div>
                        </div>
                      </div>
                      <div className="lg:w-5/12 order-1 lg:order-2">
                        <div onClick={() => openArticle(item.id)} className={cn("border p-1 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] group overflow-hidden relative cursor-pointer", theme.border, theme.boxBg)}>
                          <img 
                            src={item.image || getFallbackImage(item.id)} 
                            className="w-full transition-all duration-1000 group-hover:scale-105" 
                            loading="eager"
                            onError={(e) => {
                              e.target.onerror = null; 
                              e.target.src = getFallbackImage(item.id);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </article>
                ))}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-16">
                  {displayedNews.filter(n => !n.featured).map((item, idx) => (
                    <article
                      key={item.id}
                      className="flex flex-col group cursor-pointer"
                    >
                      <div onClick={() => openArticle(item.id)} className={cn("mb-6 border p-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden h-40 group-hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] group-hover:translate-x-0.5 group-hover:translate-y-0.5 transition-all", theme.border, theme.boxBg)}>
                        <img 
                          src={item.image || getFallbackImage(item.id)} 
                          className="w-full h-full object-cover transition-all duration-500 group-hover:scale-105" 
                          loading="lazy"
                          onError={(e) => {
                            e.target.onerror = null; 
                            e.target.src = getFallbackImage(item.id);
                          }}
                        />
                      </div>
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2 flex-grow pr-4">
                          <span className={cn("text-[10px] font-black uppercase tracking-tighter", theme.accent)}>{item.category}</span>
                          <div className={cn("h-px flex-1", darkMode ? "bg-gray-700" : "bg-gray-300")} />
                        </div>
                        <Bookmark onClick={(e) => { e.stopPropagation(); toggleBookmark(item); }} className={cn("w-3 h-3 hover:scale-125 transition-transform", isBookmarked(item) ? theme.accent : theme.muted, isBookmarked(item) && "fill-current")} />
                      </div>
                      <h3 onClick={() => openArticle(item.id)} className={cn("text-xl md:text-2xl font-black leading-tight mb-4 hover:underline transition-colors uppercase", theme.accentHover)}>{item.title}</h3>
                      <p onClick={() => openArticle(item.id)} className={cn("text-lg leading-relaxed mb-6 flex-grow", theme.muted)}>{item.summary}</p>
                      <div className={cn("flex justify-between items-center text-[12px] uppercase font-bold pt-3 border-t", theme.muted, theme.borderObj)}>
                        <span>{item.source}</span>
                        <div className="flex gap-2 items-center">
                          <span className="text-[11px]">{item.date}</span>
                          <Share2 onClick={(e) => { e.stopPropagation(); handleShare(item.title, `${window.location.origin}/article/${item.id}`); }} className="w-3 h-3 ml-2 hover:scale-110" />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              {!showBookmarks && (
                <aside className="lg:col-span-3 space-y-12">
                  <section className={cn("border-2 p-6 relative", theme.border, theme.boxBg)}>
                    <h4 className={cn("flex items-center gap-2 text-[11px] uppercase font-black tracking-widest mb-6 border-b-2 pb-4", theme.border)}>
                      <Zap className={cn("w-4 h-4", theme.accent)} /> Buzz de Dados
                    </h4>
                    <div className="space-y-6">
                      {news.slice(15, 20).map(t => (
                        <div key={t.id} onClick={() => openArticle(t.id)} className="cursor-pointer group">
                          <div className={cn("flex justify-between text-[11px] font-black mb-1", theme.muted)}>
                            <span>{t.source}</span>
                            <span className={theme.accent}>ALERT</span>
                          </div>
                          <p className="text-base font-bold leading-snug group-hover:underline">"{t.title}"</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className={cn("border-2 p-6 relative", theme.border, theme.boxBg)}>
                    <h4 className={cn("text-[11px] uppercase font-black tracking-widest mb-6 border-b-2 pb-4", theme.border)}>Análise IA: DNA</h4>
                    <div className="space-y-5">
                      {interests.slice(0, 4).map(i => (
                        <div key={i} className="space-y-1">
                          <div className={cn("flex justify-between text-[10px] font-bold uppercase", theme.text)}>
                            <span>{i}</span>
                            <span className={theme.accent}>{(Math.random() * 20 + 75).toFixed(0)}%</span>
                          </div>
                          <div className={cn("h-1 w-full overflow-hidden", darkMode ? "bg-white/10" : "bg-black/10")}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.floor(Math.random() * 40 + 60)}%` }} className={cn("h-full", theme.bgAccent)} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <button className={cn("w-full mt-8 border-2 py-2 text-[10px] uppercase font-black transition-all", theme.border, theme.accentHover)}>Ver Relatório Completo</button>
                  </section>
                </aside>
              )}
            </div>
          )}
        </AnimatePresence>

        {isLoadingMore && !showBookmarks && (
          <div className={cn("py-12 text-center border-t mt-12", theme.borderObj)}>
            <div className="flex items-center justify-center gap-2 mb-4">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <p className="text-[10px] uppercase font-black tracking-widest">Carregando mais notícias</p>
            </div>
          </div>
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-4 md:px-12 mt-20 mb-8">
        <div className={cn("border-t-2 pt-6 flex justify-end", theme.border)}>
          <span className={cn("text-xs uppercase font-bold tracking-widest", theme.muted)}>
            Desenvolvido por <span className={theme.text}>Planora Apps</span>
          </span>
        </div>
      </footer>
    </>
  );
};

const EditorSeal = ({ className }) => (
  <svg 
    viewBox="0 0 100 100" 
    className={className} 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Fundo do selo */}
    <rect x="10" y="10" width="80" height="80" fill="currentColor" fillOpacity="0.05" />
    
    {/* Bordas serrilhadas (perfuração) */}
    <path 
      d="M10 10 L15 5 L20 10 L25 5 L30 10 L35 5 L40 10 L45 5 L50 10 L55 5 L60 10 L65 5 L70 10 L75 5 L80 10 L85 5 L90 10 L95 15 L90 20 L95 25 L90 30 L95 35 L90 40 L95 45 L90 50 L95 55 L90 60 L95 65 L90 70 L95 75 L90 80 L95 85 L90 90 L85 95 L80 90 L75 95 L70 90 L65 95 L60 90 L55 95 L50 90 L45 95 L40 90 L35 95 L30 90 L25 95 L20 90 L15 95 L10 90 L5 85 L10 80 L5 75 L10 70 L5 65 L10 60 L5 55 L10 50 L5 45 L10 40 L5 35 L10 30 L5 25 L10 20 L5 15 Z" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinejoin="round" 
    />
    
    {/* Figura abstrata interna */}
    <path 
      d="M30 40 Q50 20 70 40 T30 60 T70 80" 
      stroke="currentColor" 
      strokeWidth="3" 
      strokeLinecap="round" 
      opacity="0.6"
    />
    
    {/* Carimbo de cancelamento (ondas) */}
    <path d="M5 25 Q15 20 25 25 T45 25" stroke="currentColor" strokeWidth="1" opacity="0.3" />
    <path d="M5 35 Q15 30 25 35 T45 35" stroke="currentColor" strokeWidth="1" opacity="0.3" />
  </svg>
);

const AppContent = () => {
  const { theme, darkMode, showSettings, setShowSettings, toggleInterest, interests, curateNews, isLoading, news, lastUpdate, isLoadingMore, selectedSourceIds, toggleSource } = useSettings();

  return (
    <div className={cn("min-h-screen font-serif relative overflow-x-hidden pb-20 transition-colors duration-300", theme.bg, theme.text, theme.selection)}>
      <div className="paper-texture opacity-30 pointer-events-none" />

      <motion.div
        className={cn("fixed top-0 left-0 right-0 h-1 z-[1001]", theme.bgAccent)}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: isLoading ? 1 : 0 }}
        transition={{ duration: 1.5, ease: "easeInOut" }}
        style={{ originX: 0 }}
      />

      <Routes>
        <Route path="/" element={
          <NewsList
            news={news}
            isLoading={isLoading}
            lastUpdate={lastUpdate}
            showSettings={showSettings}
            setShowSettings={setShowSettings}
            curateNews={curateNews}
            isLoadingMore={isLoadingMore}
          />
        } />
        <Route path="/article/:id" element={<ArticleView news={news} lastUpdate={lastUpdate} />} />
      </Routes>

      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSettings(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className={cn("border-4 p-8 md:p-12 max-w-2xl w-full relative z-[2001] shadow-[24px_24px_0px_0px_rgba(0,0,0,1)]", theme.bg, theme.border)}>
              <button onClick={() => setShowSettings(false)} className="absolute top-6 right-6 hover:rotate-90 transition-transform"><X className="w-8 h-8" /></button>
              <div className="flex items-center gap-4 mb-4">
                <EditorSeal className="w-20 h-20" />
                <h2 className="font-serif text-5xl font-bold border-b-2 border-black/10 pb-2 mb-2">Minha Gazetta</h2>
              </div>
              <p className={cn("mb-6", theme.muted)}>Selecione os focos de análise e as fontes que compõem sua edição diária.</p>
              
              <h3 className="text-xs font-black uppercase bg-black text-white px-2 py-1 mb-4 inline-block">Interesses</h3>
              <div className="flex flex-wrap gap-2 mb-8">
                {[
                  "Inteligência Artificial", "Cultura & Arte", "Economia Digital",
                  "Tecnologia", "Política Global", "Saúde & Bem-estar", "Esportes", "Ciência", "Moda & Estilo"
                ].map(th => (
                  <button key={th} onClick={() => toggleInterest(th)} className={cn("px-4 py-2 text-[10px] font-black uppercase border-2 transition-all border-neutral-300", interests.includes(th) ? "border-black text-red-600 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" : cn("border-black/20 hover:border-black", darkMode && "border-white/20 hover:border-white", theme.text))}>{th}</button>
                ))}
              </div>

              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-black uppercase bg-black text-white px-2 py-1 inline-block">Minhas Fontes ({selectedSourceIds.length})</h3>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 opacity-40" />
                  <input 
                    type="text" 
                    placeholder="Filtrar fontes..." 
                    className="pl-7 pr-2 py-1 text-[10px] border-b border-black/20 focus:border-black outline-none bg-transparent"
                    onChange={(e) => {
                      const term = e.target.value.toLowerCase();
                      const items = document.querySelectorAll('.source-btn');
                      items.forEach(item => {
                        const name = item.dataset.name.toLowerCase();
                        item.style.display = name.includes(term) ? 'block' : 'none';
                      });
                    }}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 mb-10 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar border-y py-4">
                {GLOBAL_SOURCES.map(source => (
                  <button 
                    key={source.id} 
                    data-name={source.name}
                    onClick={() => toggleSource(source.id)} 
                    className={cn(
                      "source-btn text-[10px] text-left p-2 border border-neutral-300 transition-all", 
                      selectedSourceIds.includes(source.id) ? "border-black text-red-600 font-bold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]" : "opacity-60 hover:opacity-100"
                    )}
                  >
                    <span className="block opacity-40 text-[8px] uppercase font-black">{source.category}</span>
                    {source.name}
                  </button>
                ))}
              </div>

              <button onClick={() => { setShowSettings(false); curateNews(true); }} className={cn("w-full py-5 font-black uppercase tracking-[0.4em] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] transition-all", theme.invertedBg)}>Sincronizar Edição Global</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Componente Wrapper / Provider
const analyzeTrends = (allArticles) => {
  const termMap = {};
  const commonStopWords = ['da', 'do', 'em', 'para', 'com', 'no', 'na', 'um', 'uma', 'os', 'as', 'e', 'o', 'a', 'de'];

  allArticles.forEach(art => {
    const words = art.title.toLowerCase().split(/\W+/);
    words.forEach(word => {
      if (word.length > 3 && !commonStopWords.includes(word)) {
        termMap[word] = (termMap[word] || 0) + 1;
      }
    });
  });

  return allArticles.map(art => {
    const words = art.title.toLowerCase().split(/\W+/);
    let score = 0;
    words.forEach(word => {
      if (termMap[word] > 1) score += termMap[word];
    });

    return {
      ...art,
      relevance: Math.min(100, 70 + score),
      isTrending: score > 15
    };
  });
};

const App = () => {
  const [interests, setInterests] = useState(() => JSON.parse(localStorage.getItem('gazetta_prefs')) || ["Inteligência Artificial", "Cultura & Arte", "Economia Digital", "Esportes"]);
  const [selectedSourceIds, setSelectedSourceIds] = useState(() => JSON.parse(localStorage.getItem('gazetta_sources')) || GLOBAL_SOURCES.filter(s => s.popular).map(s => s.id));
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('gazetta_theme') === 'dark');
  const [bookmarks, setBookmarks] = useState(() => JSON.parse(localStorage.getItem('gazetta_bookmarks')) || []);
  const [collectibles, setCollectibles] = useState(() => JSON.parse(localStorage.getItem('gazetta_stamps')) || []);

  const [news, setNews] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [currentCategory, setCurrentCategory] = useState("Todas");
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [loadedSourcesCount, setLoadedSourcesCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Carregar preferências do Firestore
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.interests) setInterests(data.interests);
          if (data.sources) setSelectedSourceIds(data.sources);
          if (data.collectibles) setCollectibles(data.collectibles);
          if (data.darkMode !== undefined) setDarkMode(data.darkMode);
        } else {
          // Criar perfil básico se não existir
          await setDoc(doc(db, 'users', currentUser.uid), {
            displayName: currentUser.displayName,
            email: currentUser.email,
            photoURL: currentUser.photoURL,
            lastLogin: new Date(),
            sources: selectedSourceIds,
            interests: interests
          }, { merge: true });
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Erro no login:", error);
    }
  };

  const logout = () => signOut(auth);

  useEffect(() => { 
    localStorage.setItem('gazetta_theme', darkMode ? 'dark' : 'light'); 
    if (user) {
      updateDoc(doc(db, 'users', user.uid), { darkMode }).catch(e => console.error(e));
    }
  }, [darkMode, user]);
  useEffect(() => { localStorage.setItem('gazetta_bookmarks', JSON.stringify(bookmarks)); }, [bookmarks]);
  useEffect(() => { localStorage.setItem('gazetta_prefs', JSON.stringify(interests)); }, [interests]);
  useEffect(() => { localStorage.setItem('gazetta_sources', JSON.stringify(selectedSourceIds)); }, [selectedSourceIds]);

  const toggleSource = (id) => {
    if (selectedSourceIds.includes(id)) {
      setSelectedSourceIds(selectedSourceIds.filter(s => s !== id));
    } else {
      setSelectedSourceIds([...selectedSourceIds, id]);
    }
  };

  const toggleTheme = () => setDarkMode(!darkMode);

  const collectStamp = async (stampId) => {
    if (collectibles.includes(stampId)) return;
    const newList = [...collectibles, stampId];
    setCollectibles(newList);
    localStorage.setItem('gazetta_stamps', JSON.stringify(newList));
    
    if (user) {
      await updateDoc(doc(db, 'users', user.uid), {
        collectibles: arrayUnion(stampId),
        lastStampAt: serverTimestamp()
      });
    }
  };

  const toggleBookmark = (article) => {
    if (bookmarks.find(b => b.id === article.id)) {
      setBookmarks(bookmarks.filter(b => b.id !== article.id));
    } else {
      setBookmarks([...bookmarks, article]);
    }
  };

  const isBookmarked = (article) => !!bookmarks.find(b => b.id === article.id);

  const handleShare = async (title, url) => {
    const shareData = {
      title: `Gazetta: ${title}`,
      text: `Confira esta notícia na Gazetta:`,
      url: url
    };
    
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        navigator.clipboard.writeText(url);
      }
    } else {
      navigator.clipboard.writeText(url);
      alert('Link copiado para a área de transferência!');
    }
  };

  const theme = {
    bg: darkMode ? "bg-[#161616]" : "bg-[#f4f1ea]",
    text: darkMode ? "text-[#dfdfdf]" : "text-[#1a1a1a]",
    border: darkMode ? "border-[#404040]" : "border-black",
    borderObj: darkMode ? "border-gray-700" : "border-gray-400",
    boxBg: darkMode ? "bg-[#222]" : "bg-white",
    muted: darkMode ? "text-[#909090]" : "text-gray-600",
    accent: darkMode ? "text-red-500" : "text-red-700",
    bgAccent: darkMode ? "bg-red-500" : "bg-red-700",
    accentHover: darkMode ? "hover:text-red-400" : "group-hover:text-red-900 hover:text-red-900",
    accentDecor: darkMode ? "decoration-red-500/30" : "decoration-red-700/30",
    invertedBg: darkMode ? "bg-white text-black border-white" : "bg-black text-white border-black",
    firstLetter: darkMode ? "first-letter:text-white" : "first-letter:text-black",
    selection: darkMode ? "selection:bg-white selection:text-black" : "selection:bg-black selection:text-white",
  };

  // Funções de Load


  const curateNews = useCallback(async (forceRefresh = false) => {
    // 1. Verificar Cache
    if (!forceRefresh) {
      const cached = localStorage.getItem('gazetta_news_cache');
      const cacheTime = localStorage.getItem('gazetta_news_cache_time');
      if (cached && cacheTime && (Date.now() - parseInt(cacheTime) < 20 * 60 * 1000)) {
        setNews(JSON.parse(cached));
        setLastUpdate(new Date(parseInt(cacheTime)));
        return;
      }
    }

    setIsLoading(true);
    try {
      const activeSources = GLOBAL_SOURCES.filter(s => selectedSourceIds.includes(s.id));
      const allResults = [];

      // Paralelismo limitado para evitar bloqueios
      for (let i = 0; i < activeSources.length; i += 3) {
        const batch = activeSources.slice(i, i + 3);
        const batchResults = await Promise.all(
          batch.map(async (source) => {
            try {
              const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}`);
              
              if (response.status === 429) {
                console.warn(`Limitado pelo servidor (429) ao acessar: ${source.name}`);
                return [];
              }

              const data = await response.json();
              if (data.status !== 'ok') return [];

              return data.items.map(item => {
                let imageUrl = item.enclosure?.link || item.thumbnail || "";

                if (!imageUrl || imageUrl.includes("feedburner") || imageUrl.toLowerCase().includes("banner") || imageUrl.toLowerCase().includes("assine")) {
                  const htmlContent = (item.description || "") + (item.content || "");
                  const imgMatch = htmlContent.match(/<img[^>]+src="([^">]+)"/);
                  if (imgMatch && imgMatch[1]) {
                    const foundImg = imgMatch[1];
                    if (!foundImg.toLowerCase().includes("banner") && !foundImg.toLowerCase().includes("assine")) {
                      imageUrl = foundImg;
                    } else {
                      imageUrl = "";
                    }
                  }
                }

                const generateId = (str) => {
                  let hash = 0;
                  for (let i = 0; i < str.length; i++) {
                    const char = str.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash;
                  }
                  return Math.abs(hash).toString(36);
                };

                const articleId = generateId(item.link || item.guid || Math.random().toString());

                return {
                  id: articleId,
                  title: fixEncoding(decodeEntities(item.title)),
                  summary: fixEncoding(decodeEntities((item.description || "").replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim().slice(0, 180) + "...")),
                  content: fixEncoding(cleanHTMLContent(item.content || item.description)),
                  category: source.category,
                  author: decodeEntities(item.author || source.name),
                  source: source.name,
                  time: new Date(item.pubDate || new Date()).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
                  date: new Date(item.pubDate || new Date()).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-'),
                  link: item.link,
                  image: imageUrl || null,
                };
              });
            } catch (e) {
              return [];
            }
          })
        );
        allResults.push(...batchResults);
        if (i + 3 < activeSources.length) await new Promise(r => setTimeout(r, 2500));
      }

      let flatNews = allResults.flat();

      flatNews = flatNews.filter(art => {
        const contentToCheck = (art.title + " " + art.summary).toLowerCase();
        return !AD_KEYWORDS.some(keyword => contentToCheck.includes(keyword));
      });

      const seenTitles = new Set();
      flatNews = flatNews.filter(n => {
        const normalized = n.title.toLowerCase().trim();
        if (seenTitles.has(normalized)) return false;
        seenTitles.add(normalized);
        return true;
      });

      let analyzedNews = analyzeTrends(flatNews);

      if (analyzedNews.length === 0) {
        analyzedNews = [{
          id: 'error', title: "Aviso: Atraso na Entrega das Notícias", summary: "Não foi possível conectar.",
          content: "<p>Nossos sistemas de IA estão tentando restabelecer a conexão. Por favor, tente atualizar.</p>",
          category: "Sistema", relevance: 100, author: "Editor", source: "gazetta.news", time: "--:--", image: null, featured: true
        }];
      }

      analyzedNews.sort((a, b) => b.relevance - a.relevance);

      const headline = analyzedNews.find(n => n.image && !n.image.includes("unsplash")) || analyzedNews[0];
      analyzedNews = analyzedNews.map(n => ({ ...n, featured: n.id === headline.id }));

      setNews(analyzedNews);
      setLastUpdate(new Date());
      localStorage.setItem('gazetta_news_cache', JSON.stringify(analyzedNews));
      localStorage.setItem('gazetta_news_cache_time', Date.now().toString());
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  }, [selectedSourceIds]);

  const loadMoreNews = useCallback(async () => {
    if (isLoadingMore || loadedSourcesCount >= GLOBAL_SOURCES.length) return;

    setIsLoadingMore(true);
    try {
      const startIndex = loadedSourcesCount;
      const endIndex = Math.min(startIndex + 2, GLOBAL_SOURCES.length);
      const moreSources = GLOBAL_SOURCES.slice(startIndex, endIndex);
      const allResults = [];

      for (let i = 0; i < moreSources.length; i++) {
        const source = moreSources[i];
        try {
          const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}`);
          const data = await response.json();

          if (data.status !== 'ok') continue;

          const items = data.items.map(item => {
            let imageUrl = item.enclosure?.link || item.thumbnail || "";
            if (!imageUrl || imageUrl.includes("feedburner") || imageUrl.toLowerCase().includes("banner") || imageUrl.toLowerCase().includes("assine")) {
              const htmlContent = (item.description || "") + (item.content || "");
              const imgMatch = htmlContent.match(/<img[^>]+src="([^">]+)"/);
              if (imgMatch && imgMatch[1]) {
                const foundImg = imgMatch[1];
                if (!foundImg.toLowerCase().includes("banner") && !foundImg.toLowerCase().includes("assine")) {
                  imageUrl = foundImg;
                } else {
                  imageUrl = "";
                }
              }
            }

            const generateId = (str) => {
              let hash = 0;
              for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
              }
              return Math.abs(hash).toString(36);
            };

            return {
              id: generateId(item.link || item.guid || Math.random().toString()),
              title: fixEncoding(decodeEntities(item.title)),
              summary: fixEncoding(decodeEntities((item.description || "").replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim().slice(0, 180) + "...")),
              content: fixEncoding(cleanHTMLContent(item.content || item.description)),
              category: source.category,
              author: decodeEntities(item.author || source.name),
              source: source.name,
              time: new Date(item.pubDate || new Date()).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
              date: new Date(item.pubDate || new Date()).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-'),
              link: item.link,
              image: imageUrl || null,
            };
          });

          allResults.push(...items);
        } catch (e) {
          continue;
        }
      }

      let flatNews = allResults;
      flatNews = flatNews.filter(art => !AD_KEYWORDS.some(keyword => (art.title + " " + art.summary).toLowerCase().includes(keyword)));

      const existingIds = new Set(news.map(n => n.id));
      flatNews = flatNews.filter(n => !existingIds.has(n.id));

      if (flatNews.length > 0) {
        const analyzedNews = analyzeTrends(flatNews);
        setNews(prevNews => [...prevNews, ...analyzedNews]);
      }

      setLoadedSourcesCount(endIndex);
    } catch (error) {
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, loadedSourcesCount, news]);

  const toggleInterest = (theme) => {
    if (interests.includes(theme)) {
      setInterests(interests.filter(i => i !== theme));
    } else {
      setInterests([...interests, theme]);
    }
  };

  useEffect(() => {
    curateNews();
    setLoadedSourcesCount(8);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;

      if (scrollTop + clientHeight >= scrollHeight - 100) {
        if (!isLoadingMore && loadedSourcesCount < GLOBAL_SOURCES.length && !showBookmarks) {
          loadMoreNews();
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoadingMore, loadedSourcesCount, showBookmarks, loadMoreNews]);

  return (
    <SettingsContext.Provider value={{
      theme, darkMode, toggleTheme,
      bookmarks, toggleBookmark, isBookmarked, showBookmarks, setShowBookmarks,
      interests, toggleInterest,
      handleShare,
      showSettings, setShowSettings,
      currentCategory, setCurrentCategory,
      news, curateNews, isLoading, isLoadingMore, lastUpdate,
      user, login, logout,
      selectedSourceIds, toggleSource,
      collectibles, collectStamp
    }}>
      <AppContent />
    </SettingsContext.Provider>
  );
};

export default App;
