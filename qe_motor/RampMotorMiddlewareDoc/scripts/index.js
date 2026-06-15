(function () {
  'use strict';

  const MIN_KEYWORD_LENGTH = 2;
  const DEBOUNCE_DELAY = 300;
  const SNIPPET_PADDING = 50;
  const MAX_RESULTS = 30;
  const HIGHLIGHT_COLOR_OTHER = '#ffef99';
  const HIGHLIGHT_COLOR_CURRENT = '#ffd166';

  const searchIndex = [];
  let isIndexBuilt = false;
  let debounceTimer = null;

  let matchState = {
    keyword: '',
    matches: [],
    currentIndex: -1,
    isActive: false,
    markerEls: []
  };

  const navSectionsEl = document.getElementById('nav-sections');
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const searchStatus = document.getElementById('search-status');
  const searchResults = document.getElementById('search-results');
  const contentFrame = document.getElementById('content');
  const nav = document.getElementById('nav');
  const navResizer = document.getElementById('nav-resizer');
  const allLinks = document.querySelectorAll('#nav-sections ul a');

  const matchNavBar = document.getElementById('match-nav-bar');
  const matchNavKeyword = document.getElementById('match-nav-keyword');
  const matchNavCounter = document.getElementById('match-nav-counter');
  const matchNavPrev = document.getElementById('match-nav-prev');
  const matchNavNext = document.getElementById('match-nav-next');
  const matchNavClose = document.getElementById('match-nav-close');
  const scrollbarMarkers = document.getElementById('scrollbar-markers');

  const NAV_WIDTH_STORAGE_KEY = 'ramp-doc-nav-width';
  const NAV_MIN_WIDTH = 300;
  const NAV_MAX_WIDTH = 720;
  const NAV_DEFAULT_WIDTH = 400;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function setNavWidth(width) {
    const clampedWidth = clamp(width, NAV_MIN_WIDTH, NAV_MAX_WIDTH);
    document.documentElement.style.setProperty('--nav-width', `${clampedWidth}px`);
    localStorage.setItem(NAV_WIDTH_STORAGE_KEY, String(clampedWidth));

    if (matchState.isActive) {
      renderScrollbarMarkers();
    }
  }

  function restoreNavWidth() {
    const savedWidth = Number(localStorage.getItem(NAV_WIDTH_STORAGE_KEY));
    if (!Number.isNaN(savedWidth) && savedWidth > 0) {
      setNavWidth(savedWidth);
    }
  }

  function initNavResize() {
    if (!nav || !navResizer) return;

    let startX = 0;
    let startWidth = 0;

    navResizer.addEventListener('mousedown', function (event) {
      event.preventDefault();

      startX = event.clientX;
      startWidth = nav.getBoundingClientRect().width;
      document.body.classList.add('resizing-nav');

      function onMouseMove(moveEvent) {
        const deltaX = moveEvent.clientX - startX;
        setNavWidth(startWidth + deltaX);
      }

      function onMouseUp() {
        document.body.classList.remove('resizing-nav');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        if (matchState.isActive) {
          renderScrollbarMarkers();
        }
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    navResizer.addEventListener('dblclick', function () {
      setNavWidth(NAV_DEFAULT_WIDTH);
    });
  }

  allLinks.forEach(link => {
    link.addEventListener('click', function () {
      document.querySelectorAll('#nav-sections a').forEach(a => a.classList.remove('active'));
      this.classList.add('active');
      contentFrame.onload = null;
      hideMatchNavBar();
    });
  });

  if (allLinks.length > 0) {
    allLinks[0].classList.add('active');
  }

  async function buildSearchIndex() {
    searchStatus.textContent = '⏳ Indexing documentation...';
    let indexed = 0;
    let failed = 0;

    const linksByCategory = [];
    let currentCategory = '';
    const sectionsChildren = Array.from(navSectionsEl.children);

    sectionsChildren.forEach(child => {
      if (child.tagName === 'H2') {
        currentCategory = child.textContent.trim();
      } else if (child.tagName === 'UL') {
        const links = child.querySelectorAll('a');
        links.forEach(link => {
          linksByCategory.push({ link: link, category: currentCategory });
        });
      }
    });

    const promises = linksByCategory.map(async ({ link, category }) => {
      try {
        const response = await fetch(link.href);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const html = await response.text();

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        tempDiv.querySelectorAll('script, style, title, head, meta, link').forEach(el => el.remove());

        const text = (tempDiv.textContent || tempDiv.innerText || '')
          .replace(/\s+/g, ' ')
          .trim();

        searchIndex.push({
          title: link.textContent.trim(),
          url: link.href,
          category: category,
          content: text.toLowerCase(),
          originalContent: text
        });
        indexed++;
      } catch (e) {
        console.warn('Failed to index:', link.href, e.message);
        failed++;
      }
    });

    await Promise.all(promises);

    isIndexBuilt = true;
    searchStatus.textContent = `✓ Indexed ${indexed} pages` +
      (failed > 0 ? ` (${failed} failed)` : '');

    setTimeout(() => {
      if (searchInput.value.trim() === '') {
        searchStatus.textContent = '';
      }
    }, 3000);
  }

  function performSearch(keyword) {
    keyword = keyword.replace(/\s+/g, ' ').trim().toLowerCase();
    searchResults.innerHTML = '';

    if (keyword.length < MIN_KEYWORD_LENGTH) {
      searchStatus.textContent = isIndexBuilt
        ? `Type at least ${MIN_KEYWORD_LENGTH} characters to search`
        : '⏳ Indexing...';
      return;
    }

    if (!isIndexBuilt) {
      searchResults.innerHTML = '<div class="search-loading">⏳ Still indexing, please wait...</div>';
      return;
    }

    const results = [];
    for (const page of searchIndex) {
      const idx = page.content.indexOf(keyword);
      if (idx !== -1) {
        let score = 0;
        if (page.title.toLowerCase().includes(keyword)) score += 100;
        const occurrences = (page.content.match(new RegExp(escapeRegex(keyword), 'gi')) || []).length;
        score += occurrences;

        const start = Math.max(0, idx - SNIPPET_PADDING);
        const end = Math.min(page.content.length, idx + keyword.length + SNIPPET_PADDING);
        let snippet = page.originalContent.substring(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < page.content.length) snippet = snippet + '...';

        results.push({
          title: page.title,
          url: page.url,
          category: page.category,
          snippet: snippet,
          score: score,
          occurrences: occurrences
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, MAX_RESULTS);

    searchStatus.textContent = `Found ${results.length} result(s)` +
      (results.length > MAX_RESULTS ? ` (showing top ${MAX_RESULTS})` : '');

    if (results.length === 0) {
      searchResults.innerHTML = '<div class="search-no-results">No results found for "' +
        escapeHtml(keyword) + '"</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const r of topResults) {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      const highlightedSnippet = highlightKeyword(r.snippet, keyword);
      item.innerHTML = `
        <div class="search-result-title">${escapeHtml(r.title)}</div>
        <div class="search-result-category">${escapeHtml(r.category)} • ${r.occurrences} match(es)</div>
        <div class="search-result-snippet">${highlightedSnippet}</div>
      `;

      item.addEventListener('click', () => {
        loadResultInIframe(r.url, keyword);

        document.querySelectorAll('#nav-sections a').forEach(a => a.classList.remove('active'));
        const matchedLink = Array.from(allLinks).find(a => a.href === r.url);
        if (matchedLink) {
          matchedLink.classList.add('active');
          scrollLinkIntoView(matchedLink, navSectionsEl);
        }

        document.querySelectorAll('.search-result-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
      });
      fragment.appendChild(item);
    }
    searchResults.appendChild(fragment);
  }

  function scrollLinkIntoView(link, container) {
    if (!link || !container) return;

    const linkRect = link.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const linkRelativeTop = linkRect.top - containerRect.top + container.scrollTop;
    const linkHeight = link.offsetHeight;
    const containerHeight = container.clientHeight;
    const containerScrollTop = container.scrollTop;

    if (linkRelativeTop < containerScrollTop) {
      container.scrollTo({ top: linkRelativeTop - 20, behavior: 'smooth' });
    } else if (linkRelativeTop + linkHeight > containerScrollTop + containerHeight) {
      container.scrollTo({ top: linkRelativeTop - containerHeight + linkHeight + 20, behavior: 'smooth' });
    }
  }

  function loadResultInIframe(url, keyword) {
    matchState.keyword = keyword;
    matchState.matches = [];
    matchState.currentIndex = -1;
    matchState.markerEls = [];

    contentFrame.src = url;

    contentFrame.onload = function () {
      try {
        const iframeDoc = contentFrame.contentDocument || contentFrame.contentWindow.document;
        if (!iframeDoc) {
          hideMatchNavBar();
          return;
        }
        highlightInIframe(iframeDoc, keyword);
      } catch (e) {
        console.warn('Cannot highlight in iframe (cross-origin):', e.message);
        hideMatchNavBar();
      }
    };
  }

  function highlightInIframe(doc, keyword) {
    removeHighlights(doc);

    const walker = doc.createTreeWalker(
      doc.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
          const parent = node.parentNode;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    const allMarks = findAndWrapMatches(doc, textNodes, keyword);
    matchState.matches = allMarks;
    matchState.currentIndex = allMarks.length > 0 ? 0 : -1;

    if (allMarks.length > 0) {
      setCurrentMatch(0);
      showMatchNavBar();
    } else {
      hideMatchNavBar();
    }
  }

  function findAndWrapMatches(doc, textNodes, keyword) {
    const normKeyword = keyword.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normKeyword) return [];

    let combined = '';
    const charMap = [];

    textNodes.forEach(tn => {
      const raw = tn.nodeValue;
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (/\s/.test(ch)) {
          if (combined.length > 0 && combined[combined.length - 1] === ' ') continue;
          combined += ' ';
        } else {
          combined += ch;
        }
        charMap.push({ node: tn, offset: i });
      }
    });

    const lowerCombined = combined.toLowerCase();
    const matchRanges = [];
    let searchFrom = 0;
    let idx;
    while ((idx = lowerCombined.indexOf(normKeyword, searchFrom)) !== -1) {
      matchRanges.push({ startIdx: idx, endIdx: idx + normKeyword.length - 1 });
      searchFrom = idx + normKeyword.length;
    }
    if (matchRanges.length === 0) return [];

    const matchSegmentsList = matchRanges.map(range => {
      const segments = [];
      let curNode = null;
      let segStart = 0;
      let segEnd = 0;
      for (let i = range.startIdx; i <= range.endIdx; i++) {
        const { node: n, offset } = charMap[i];
        if (n !== curNode) {
          if (curNode) segments.push({ node: curNode, start: segStart, end: segEnd });
          curNode = n;
          segStart = offset;
          segEnd = offset;
        } else {
          segEnd = offset;
        }
      }
      if (curNode) segments.push({ node: curNode, start: segStart, end: segEnd });
      return segments;
    });

    const segmentsByNode = new Map();
    matchSegmentsList.forEach((segments, matchIndex) => {
      segments.forEach(seg => {
        if (!segmentsByNode.has(seg.node)) segmentsByNode.set(seg.node, []);
        segmentsByNode.get(seg.node).push({ start: seg.start, end: seg.end, matchIndex });
      });
    });

    const markByMatchIndex = new Map();

    segmentsByNode.forEach((segs, tn) => {
      segs.sort((a, b) => b.start - a.start);
      segs.forEach(seg => {
        const range = doc.createRange();
        range.setStart(tn, seg.start);
        range.setEnd(tn, seg.end + 1);

        const mark = doc.createElement('mark');
        mark.className = 'search-highlight';
        mark.style.background = HIGHLIGHT_COLOR_OTHER;
        mark.style.padding = '0 2px';
        mark.style.borderRadius = '2px';

        try {
          range.surroundContents(mark);
          if (!markByMatchIndex.has(seg.matchIndex)) markByMatchIndex.set(seg.matchIndex, []);
          markByMatchIndex.get(seg.matchIndex).push(mark);
        } catch (e) {
          // Some partial inline-element ranges cannot be wrapped safely.
        }
      });
    });

    const allMarks = [];
    for (let i = 0; i < matchRanges.length; i++) {
      const marks = markByMatchIndex.get(i);
      if (marks && marks.length > 0) {
        const primary = marks[0];
        primary._group = marks;
        allMarks.push(primary);
      }
    }

    return allMarks;
  }

  function setCurrentMatch(index) {
    if (matchState.matches.length === 0) return;

    matchState.matches.forEach(m => {
      const group = m._group || [m];
      group.forEach(g => {
        g.style.background = HIGHLIGHT_COLOR_OTHER;
        g.style.color = '';
        g.style.outline = '';
        g.style.outlineOffset = '';
        g.style.boxShadow = '';
      });
    });

    const target = matchState.matches[index];
    const targetGroup = target._group || [target];
    targetGroup.forEach(g => {
      g.style.background = HIGHLIGHT_COLOR_CURRENT;
      g.style.color = '#111827';
      g.style.outline = '1px solid #3b82f6';
      g.style.outlineOffset = '1px';
      g.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.16)';
    });

    matchState.currentIndex = index;
    updateMatchNavCounter();
    updateScrollbarMarkers();

    try {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      target.scrollIntoView();
    }
  }

  function nextMatch() {
    if (matchState.matches.length === 0) return;
    setCurrentMatch((matchState.currentIndex + 1) % matchState.matches.length);
  }

  function prevMatch() {
    if (matchState.matches.length === 0) return;
    setCurrentMatch((matchState.currentIndex - 1 + matchState.matches.length) % matchState.matches.length);
  }

  function showMatchNavBar() {
    matchState.isActive = true;
    matchNavKeyword.textContent = `"${matchState.keyword}"`;
    updateMatchNavCounter();
    renderScrollbarMarkers();
    matchNavBar.classList.add('visible');
  }

  function hideMatchNavBar() {
    matchState.isActive = false;
    matchNavBar.classList.remove('visible');
    hideScrollbarMarkers();

    try {
      const iframeDoc = contentFrame.contentDocument || contentFrame.contentWindow.document;
      removeHighlights(iframeDoc);
    } catch (e) {
      // Cross-origin iframe: ignore.
    }

    matchState.matches = [];
    matchState.currentIndex = -1;
    matchState.keyword = '';
    matchState.markerEls = [];
  }

  function updateMatchNavCounter() {
    const total = matchState.matches.length;
    const current = total > 0 ? matchState.currentIndex + 1 : 0;
    matchNavCounter.textContent = `${current} / ${total}`;
    matchNavPrev.disabled = total === 0;
    matchNavNext.disabled = total === 0;
  }

  function renderScrollbarMarkers() {
    scrollbarMarkers.innerHTML = '';
    matchState.markerEls = [];

    if (matchState.matches.length === 0) {
      scrollbarMarkers.classList.remove('visible');
      return;
    }

    try {
      const iframeDoc = contentFrame.contentDocument || contentFrame.contentWindow.document;
      const iframeWin = contentFrame.contentWindow;
      const docHeight = Math.max(
        iframeDoc.documentElement.scrollHeight,
        iframeDoc.body ? iframeDoc.body.scrollHeight : 0
      );
      if (docHeight <= 0) {
        scrollbarMarkers.classList.remove('visible');
        return;
      }

      const scrollTop = iframeWin.pageYOffset || iframeDoc.documentElement.scrollTop || 0;
      const fragment = document.createDocumentFragment();

      matchState.matches.forEach((mark, idx) => {
        const rect = mark.getBoundingClientRect();
        const absoluteTop = rect.top + scrollTop;
        let ratio = absoluteTop / docHeight;
        ratio = Math.max(0, Math.min(1, ratio));

        const marker = document.createElement('div');
        marker.className = 'scrollbar-marker';
        if (idx === matchState.currentIndex) marker.classList.add('current');
        marker.style.top = `calc(${(ratio * 100).toFixed(3)}% - 1.5px)`;
        marker.title = `Match ${idx + 1} of ${matchState.matches.length}`;
        marker.addEventListener('click', () => setCurrentMatch(idx));

        matchState.markerEls[idx] = marker;
        fragment.appendChild(marker);
      });

      scrollbarMarkers.appendChild(fragment);
      scrollbarMarkers.classList.add('visible');
    } catch (e) {
      console.warn('Cannot create scrollbar markers (cross-origin):', e.message);
      scrollbarMarkers.classList.remove('visible');
    }
  }

  function updateScrollbarMarkers() {
    if (!matchState.markerEls.length) {
      renderScrollbarMarkers();
      return;
    }
    matchState.markerEls.forEach((el, idx) => {
      if (!el) return;
      el.classList.toggle('current', idx === matchState.currentIndex);
    });
  }

  function hideScrollbarMarkers() {
    scrollbarMarkers.classList.remove('visible');
    scrollbarMarkers.innerHTML = '';
    matchState.markerEls = [];
  }

  function removeHighlights(doc) {
    if (!doc) return;
    doc.querySelectorAll('mark.search-highlight').forEach(m => {
      const parent = m.parentNode;
      parent.replaceChild(doc.createTextNode(m.textContent), m);
      parent.normalize();
    });
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function highlightKeyword(text, keyword) {
    const escaped = escapeHtml(text);
    const regex = new RegExp('(' + escapeRegex(keyword) + ')', 'gi');
    return escaped.replace(regex, '<mark>$1</mark>');
  }

  function clearSearch() {
    searchInput.value = '';
    searchResults.innerHTML = '';
    searchStatus.textContent = '';
    searchClear.style.display = 'none';
    hideMatchNavBar();
  }

  searchInput.addEventListener('input', function () {
    const keyword = this.value;
    searchClear.style.display = keyword.length > 0 ? 'block' : 'none';

    if (matchState.isActive && keyword.replace(/\s+/g, ' ').trim().toLowerCase() !== matchState.keyword.toLowerCase()) {
      hideMatchNavBar();
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      performSearch(keyword);
    }, DEBOUNCE_DELAY);
  });

  searchClear.addEventListener('click', clearSearch);
  matchNavPrev.addEventListener('click', prevMatch);
  matchNavNext.addEventListener('click', nextMatch);
  matchNavClose.addEventListener('click', hideMatchNavBar);

  let resizeTimer = null;
  window.addEventListener('resize', function () {
    if (!matchState.isActive) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderScrollbarMarkers();
    }, 150);
  });

  restoreNavWidth();
  initNavResize();
  buildSearchIndex();
})();
