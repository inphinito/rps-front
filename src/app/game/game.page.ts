import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Subject, Subscription, zip } from 'rxjs';
import { delay, map, switchMap, tap } from 'rxjs/operators';
import { Action } from '../interfaces/Action';
import { Game } from '../interfaces/Game';
import { Mode, State } from '../interfaces/Settings';
import { GamesService } from '../services/games.service';

@Component({
	selector: 'app-game',
	templateUrl: './game.page.html',
	styleUrls: ['./game.page.scss'],
})
export class GamePage implements OnInit {

	timeToPlay: number = 5000;
	alertsDelay: number = 3000;

	id: string;
	game: Game;
	states: State[] = this._gamesSvc.settings.states;
	mode: Mode = this._gamesSvc.settings.modes[0];
	actions: Action[] = this._gamesSvc.settings.actions.filter(o => this.mode.allowedActionCodes.indexOf(o.code) > -1);
	roundResult: string;
	showGameResult: boolean = false;
	showActionsChoosed: boolean = false;

	userActionSbj = new Subject<Action>();
	machineActionSbj = new Subject<Action>();

	/**
	 * Observable que maneja reactivamente la lógica de la ronda
	 *
	 * @memberof GamePage
	 */
	round$ = zip(
		this.userActionSbj,
		this.machineActionSbj.pipe(
			delay(Math.random() * this.timeToPlay),
			map(_ => this.randomAction()),
			tap(_ => this.showToast('MACHINE_HAS_CHOOSEN')),
		)
	).pipe(

		// Obtenemos el resultado de la ronda y enviamos al servidor
		map(o => ({ resultCode: this.getRoundResult(o[0], o[1]), userActionCode: o[0].code, machineActionCode: o[1].code })),
		tap(o => {
			console.log(o.userActionCode, 'VS', o.machineActionCode);
			this.roundResult = o.resultCode;
		}),
		switchMap(o => {
			return this._gamesSvc.saveRound(this.id, o);
		}),

		// Esperamos a cerrar la alerta y la eliminamos
		delay(this.alertsDelay),
		tap(o => {
			this.roundResult = null;
		}),

		// si se ha ganado el juego se anuncia, si no, se oculta la alerta y se inicia una nueva ronda
		tap(o => {
			this.game = o;
			if (this.game.resultCode) {
				this.showGameResult = true;
				this.roundSct.unsubscribe();
			} else {
				this.showGameResult = false;
				this.machineActionSbj.next();
			}
		})
	);

	roundSct: Subscription;

	constructor(
		private route: ActivatedRoute,
		private _gamesSvc: GamesService,
		private _toastCtrl: ToastController
	) { }

	async ngOnInit() {
		this.route.params.subscribe(async (params) => {
			this.id = params['id'] ?? null;
			try {
				this.game = await this._gamesSvc.find(this.id).toPromise();

				if (!this.game.resultCode) {
					this.roundSct = this.round$.subscribe();
					this.machineActionSbj.next();
				}
			} catch (error) {
				// TODO: controlar errores
				debugger;
			}
		});
	}

	play(action: Action) {
		this.userActionSbj.next(action);
	}

	/**
	 * Devuelve una acción al azar del juego
	 *
	 * @return {*} 
	 * @memberof GamePage
	 */
	randomAction() {
		const index = Math.floor(Math.random() * this.actions.length);
		const action = this.actions[index];
		return action;
	}

	/**
	 * Obtiene el resultado de la ronda respecto al jugador
	 *
	 * @param {Action} userAction
	 * @param {Action} machineAction
	 * @return {*}  {*}
	 * @memberof GamePage
	 */
	getRoundResult(userAction: Action, machineAction: Action): any {
		if (userAction.code === machineAction.code) {
			return 'TIE';
		} else if (userAction.strongAgainst.indexOf(machineAction.code) > -1) {
			return 'VICTORY';
		} else {
			return 'DEFEAT';
		}
	}

	showSummary() {
		this.showGameResult = false;
	}

	async showToast(message: string) {
		const toast = await this._toastCtrl.create({
			message,
			duration: 2000
		});
		toast.present();
	}

}
