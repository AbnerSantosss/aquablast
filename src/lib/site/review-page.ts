export interface ReviewPageState {
  page: number;
  pageCount: number;
  start: number;
  end: number;
  /** Números de página a exibir; `null` marca uma reticência. */
  numbers: Array<number | null>;
}

/** Porta fiel de getReviewPage() do reviews.js original. */
export function getReviewPage(total: number, requestedPage: number, pageSize = 5): ReviewPageState {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  let candidates: number[];
  if (pageCount <= 5) candidates = Array.from({ length: pageCount }, (_, index) => index + 1);
  else if (page <= 2) candidates = [1, 2, 3, pageCount];
  else if (page >= pageCount - 1) candidates = [1, pageCount - 2, pageCount - 1, pageCount];
  else candidates = [1, page, pageCount];
  const numbers: Array<number | null> = [];
  candidates.forEach((number, index) => {
    if (index > 0 && number - candidates[index - 1] > 1) numbers.push(null);
    numbers.push(number);
  });
  return { page, pageCount, start, end, numbers };
}
