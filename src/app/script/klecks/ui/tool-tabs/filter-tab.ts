import {BB} from '../../../bb/bb';
import {KL} from '../../kl';
import {klHistory} from '../../history/kl-history';
import {IKeyString} from '../../../bb/bb-types';
import {StatusOverlay} from '../components/status-overlay';
import {KlCanvasWorkspace} from '../../canvas-ui/kl-canvas-workspace';
import {KlCanvas} from '../../canvas/kl-canvas';
import {LANG} from '../../../language/language';
import {IFilterApply, IFilterGetDialogParam, IFilterGetDialogResult} from '../../kl-types';
import {KlColorSlider} from '../components/kl-color-slider';
import {LayerManager} from './layer-manager/layer-manager';
import {HandUi} from './hand-ui';
import {RGB} from '../../../bb/color/color';
import {getSharedFx} from '../../../fx-canvas/shared-fx';


export class FilterTab {

    private readonly rootEl: HTMLDivElement;
    private isInit = false;

    private testHasWebGL (): boolean {
        return !!getSharedFx();
    }

    constructor (
        private klRootEl: HTMLElement,
        private klColorSlider: KlColorSlider,
        private layerManager: LayerManager,
        private klCanvasWorkspace: KlCanvasWorkspace,
        private handUi: HandUi,
        private getCurrentColor: () => RGB,
        private getKlMaxCanvasSize: () => number,
        private getKlCanvas: () => KlCanvas,
        private getCurrentLayerCtx: () => CanvasRenderingContext2D | null,
        private isEmbed: boolean,
        private statusOverlay: StatusOverlay,
    ) {
        this.rootEl = document.createElement('div');
    }

    private init (): void {
        const filters = KL.filterLib;
        const buttons = [];

        if (!KL.filterLibStatus.isLoaded) {
            throw new Error('filters not loaded');
        }

        const hasWebGL: boolean = this.testHasWebGL();

        if (!hasWebGL) {
            const note = BB.el({
                parent: this.rootEl,
                className: 'kl-toolspace-note',
                content: 'Features disabled because WebGL is failing.',
                css: {
                    margin: '10px',
                    marginBottom: '0',
                },
            });
            const noteButton = BB.el({
                parent: note,
                tagName: 'button',
                textContent: 'Learn More',
                css: {
                    marginLeft: '5px',
                },
            });
            noteButton.onclick = () => {
                KL.popup({
                    target: this.klRootEl,
                    message: '<b>WebGL is not working</b>',
                    div: BB.el({
                        content: `
See if your browser supports WebGL and has it enabled: <a href="https://get.webgl.org" target="_blank" rel="noopener noreferrer">get.webgl.org</a><br>
<br>
Recently (2023-05) a number of Chrome users on Chrome OS reported that WebGL fails, although it is enabled & supported.
This has been reported to Google.
`,
                    }),
                    buttons: ['Ok'],
                    clickOnEnter: 'Ok',
                });
            };
        }

        const createButton = (filterKey: string): HTMLElement => {
            const filter = filters[filterKey];

            const button = document.createElement('button');
            const buttonLabel = LANG(filter.lang.button);
            const imClass = filter.darkNoInvert ? 'class="dark-no-invert"' : '';
            const im = '<img ' + imClass + ' height="20" width="18" src="' + filter.icon + '" alt="icon" />';
            button.innerHTML = im + buttonLabel;
            button.className = 'grid-button';
            BB.css(button, {
                lineHeight: '20px',
                fontSize: '12px',
            });
            button.tabIndex = -1;

            const filterName = LANG(filter.lang.name);

            let isEnabled = true;
            if (filter.webGL && !hasWebGL) {
                isEnabled = false;
            }

            if (isEnabled) {
                button.onclick = () => {

                    type TOptions = 'Ok' | 'Cancel';
                    const dialogButtons: TOptions[] = ['Ok', 'Cancel'];

                    const finishedDialog = (result: TOptions, filterDialog: IFilterGetDialogResult<any>): void => {
                        if (result == 'Cancel') {
                            if (filterDialog.destroy) {
                                filterDialog.destroy();
                            }
                            return;
                        }
                        let input;
                        try {
                            input = filterDialog.getInput!(); // also destroys
                        } catch (e) {
                            if ((e as Error).message.indexOf('.getInput is not a function') !== -1) {
                                throw 'filterDialog.getInput is not a function, filter: ' + filterName;
                            } else {
                                throw e;
                            }
                        }
                        applyFilter(input);
                    };

                    if (!('apply' in filters[filterKey])) {
                        alert('Application not fully loaded');
                        return;
                    }

                    const applyFilter = (input: any) => {
                        const filterResult = filters[filterKey].apply!({
                            context: this.getCurrentLayerCtx(),
                            klCanvas: this.getKlCanvas(),
                            history: klHistory,
                            input: input,
                        } as IFilterApply);
                        if (filterResult === false) {
                            alert("Couldn't apply the edit action");
                        }
                        if (filters[filterKey].updatePos === true) {
                            this.klCanvasWorkspace.resetOrFitView();
                            this.handUi.update(this.klCanvasWorkspace.getScale(), this.klCanvasWorkspace.getAngleDeg());
                        }
                        this.layerManager.update();
                    };

                    if (filters[filterKey].isInstant){
                        button.blur();
                        applyFilter(null);
                        this.statusOverlay.out('"' + filterName + '" ' + LANG('filter-applied'), true);
                    } else {
                        const secondaryColorRGB = this.klColorSlider.getSecondaryRGB();
                        const filterDialog = filters[filterKey].getDialog!({
                            context: this.getCurrentLayerCtx(),
                            klCanvas: this.getKlCanvas(),
                            maxWidth: this.getKlMaxCanvasSize(),
                            maxHeight: this.getKlMaxCanvasSize(),
                            currentColorRgb: {r: this.getCurrentColor().r, g: this.getCurrentColor().g, b: this.getCurrentColor().b},
                            secondaryColorRgb: {r: secondaryColorRGB.r, g: secondaryColorRGB.g, b: secondaryColorRGB.b},
                        } as IFilterGetDialogParam) as IFilterGetDialogResult;

                        if (!filterDialog) {
                            return;
                            //alert('Error: could not perform action');
                            //throw('filter['+filterKey+'].getDialog returned '+filterDialog+'. ctx:' + currentLayerCtx + ' klCanvas:' + klCanvas);
                        }

                        let closeFunc: () => void;
                        // Todo should move into getDialogParams
                        filterDialog.errorCallback = (e) => {
                            setTimeout(() => {
                                alert('Error: could not perform action');
                                throw e;
                            }, 0);
                            closeFunc();
                        };


                        const style: IKeyString = {};
                        if ('width' in filterDialog) {
                            style.width = filterDialog.width + 'px';
                        }

                        KL.popup({
                            target: this.klRootEl,
                            message: '<b>' + filterName + '</b>',
                            div: filterDialog.element,
                            style: style,
                            buttons: dialogButtons,
                            clickOnEnter: 'Ok',
                            callback: (result) => {
                                finishedDialog(result as TOptions, filterDialog);
                            },
                            closeFunc: (func) => {
                                closeFunc = func;
                            },
                        });
                    }
                };
            } else {
                button.disabled = true;
            }

            buttons.push(button);
            return button;
        };

        const addGroup = (groupArr: string[]): void => {
            Object.entries(filters).forEach(([filterKey, filter]) => {
                if (!groupArr.includes(filterKey)) {
                    return;
                }
                if (this.isEmbed && !filter.inEmbed) {
                    return;
                }
                this.rootEl.append(createButton(filterKey));
            });
        };

        const groupA = [
            'cropExtend',
            'flip',
            'perspective',
            'resize',
            'rotate',
            'transform',
        ];
        const groupB = [
            'brightnessContrast',
            'curves',
            'distort',
            'hueSaturation',
            'invert',
            'tiltShift',
            'toAlpha',
            'blur',
            'unsharpMask',
        ];
        const groupC = [
            'grid',
            'noise',
            'pattern',
            'vanishPoint',
        ];

        addGroup(groupA);
        this.rootEl.append(BB.el({className: 'grid-hr'}));
        addGroup(groupB);
        this.rootEl.append(BB.el({className: 'grid-hr'}));
        addGroup(groupC);

        this.isInit = true;
    }

    getElement (): HTMLElement {
        return this.rootEl;
    }

    show (): void {
        if (!this.isInit) {
            this.init();
        }
        this.rootEl.style.display = 'block';
    }

    hide (): void {
        this.rootEl.style.display = 'none';
    }

}