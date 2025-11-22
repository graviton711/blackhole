
export const createWorker = (workerCode: () => void) => {
    const code = workerCode.toString();
    const blob = new Blob([`(${code})()`], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
};
